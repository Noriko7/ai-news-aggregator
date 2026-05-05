import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import fs from 'fs';
import path from 'path';

import { GoogleDecoder } from 'google-news-url-decoder';

const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; NewsAggregator/1.0)'
  }
});

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'news.json');

const googleDecoder = new GoogleDecoder();

// Resolve Google News redirect URLs to actual article URLs
// Returns null if the URL is broken or unreachable
async function resolveUrl(url: string): Promise<string | null> {
  let targetUrl = url;

  // If it's a Google News URL, decode it to the real article URL
  if (url.includes('news.google.com')) {
    try {
      const decoded = await googleDecoder.decode(url);
      if (decoded && decoded.status && decoded.decoded_url) {
        targetUrl = decoded.decoded_url;
      }
    } catch (e) {
      console.error('URL Decode Error:', e);
    }
  }
  
  return targetUrl;
}


// Normalize title for duplicate detection (remove punctuation, spaces, lowercase)
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[\s\u3000\-–—・　、。「」【】]/g, '');
}

export type NewsItem = {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  contentSnippet: string;
  source: string;
  isPriority: boolean;
};

import {
  PERSONAL_KEYWORDS,
  DEPT_KEYWORDS,
  EXCLUDE_WORDS,
  DEPT_SERVICES,
  UPDATE_TERMS,
  TRUSTED_DOMAINS
} from '../../../lib/newsConfig';

// ─── Google News RSS URL 生成 ─────────────────────────────────────
function buildGoogleNewsUrl(keyword: string, startDate?: string, endDate?: string): string {
  let query = keyword;
  if (startDate) query += ` after:${startDate}`;
  if (endDate)   query += ` before:${endDate}`;

  const encoded = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${encoded}&hl=ja&gl=JP&ceid=JP:ja`;
}

function shouldExclude(text: string): boolean {
  return EXCLUDE_WORDS.some(w => text.includes(w));
}

// ホワイトリストに含まれるドメインかどうかチェック
function isTrustedUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return TRUSTED_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain));
  } catch {
    return false; // URLが不正な場合は除外
  }
}


function checkIsPriority(title: string, snippet: string): boolean {
  // タイトルに対象サービス名が含まれること（厳格：タイトルのみチェック）
  const titleLower = title.toLowerCase();
  const hasService = DEPT_SERVICES.some(k => titleLower.includes(k));
  if (!hasService) return false;

  // タイトルまたはスニペットに機能更新ワードが含まれること
  const fullText = (title + ' ' + snippet).toLowerCase();
  const hasUpdate = UPDATE_TERMS.some(k => fullText.includes(k));
  return hasUpdate;
}

// ─── メイン API ───────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || undefined;
    const endDate   = searchParams.get('endDate')   || undefined;

    // 全キーワードのURLリストを生成（個人用 + 部内用）
    const allKeywords = Array.from(new Set([...PERSONAL_KEYWORDS, ...DEPT_KEYWORDS]));
    const urls = allKeywords.map(kw => ({
      keyword: kw,
      url: buildGoogleNewsUrl(kw, startDate, endDate),
      isDept: DEPT_KEYWORDS.includes(kw)
    }));

    // 並列でRSSフィードを取得
    const fetchPromises = urls.map(async ({ url, isDept }) => {
      try {
        const feed = await parser.parseURL(url);
        const items = [];
        for (const item of feed.items) {
          if (!item.link || !item.title) continue;
          // Resolve Google News redirect to get the real article URL
          const resolvedUrl = await resolveUrl(item.link);
          
          // Skip if the URL is broken or unreachable
          if (!resolvedUrl) continue;
          
          // Skip if not a trusted domain (security check)
          if (!isTrustedUrl(resolvedUrl)) continue;
          
          items.push({ item: { ...item, link: resolvedUrl }, isDept });
        }
        return items;
      } catch (err) {
        console.error(`Failed: ${url}`, err);
        return [];
      }
    });

    const results = (await Promise.all(fetchPromises)).flat();

    // Deduplicate by URL AND by normalized title
    const newsMap = new Map<string, NewsItem>();
    const seenTitles = new Set<string>();

    for (const { item, isDept } of results) {
      if (!item.link || !item.title) continue;

      const title   = item.title.replace(/\s*-\s*[^-]+$/, '').trim();
      const snippet = item.contentSnippet || '';
      const text    = title + ' ' + snippet;
      const normalTitle = normalizeTitle(title);

      if (shouldExclude(text)) continue;

      // Skip if same title already seen (duplicate from different search keyword)
      if (seenTitles.has(normalTitle)) continue;

      // Period filter (double-check client side too)
      if (startDate || endDate) {
        const pubTime = new Date(item.pubDate || '').getTime();
        if (isNaN(pubTime)) continue;
        const start = startDate ? new Date(startDate + 'T00:00:00').getTime() : 0;
        const end   = endDate   ? new Date(endDate   + 'T23:59:59.999').getTime() : Infinity;
        if (pubTime < start || pubTime > end) continue;
      }

      const id = item.link;
      const existing = newsMap.get(id);
      // isPriority is ONLY based on strict content check, NOT on which keyword fetched it
      const isPriority = checkIsPriority(title, snippet) || (existing?.isPriority ?? false);

      newsMap.set(id, {
        id,
        title,
        link: item.link,
        pubDate: item.pubDate || new Date().toISOString(),
        contentSnippet: snippet,
        source: item.creator || 'Google News',
        isPriority
      });

      seenTitles.add(normalTitle);
    }

    const newItems = Array.from(newsMap.values());

    // ─── データベースとの統合と最終的な重複排除（常に最新を優先） ───
    let db: NewsItem[] = [];
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      if (fs.existsSync(DATA_FILE)) {
        db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      }
    } catch (e) {
      console.warn('Local DB read warning (Vercel serverless environment):', e);
    }

    // 全データをマージして日付が新しい順にソート（最新版を優先させるため）
    const allItems = [...newItems, ...db].sort(
      (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
    );

    const finalMap = new Map<string, NewsItem>();
    const finalSeenTitles = new Set<string>();

    for (const item of allItems) {
      const normalTitle = normalizeTitle(item.title);
      
      // 同じURL、または同じタイトルの記事が既に（より新しい日付で）追加されていればスキップ
      if (finalMap.has(item.id) || finalSeenTitles.has(normalTitle)) {
        continue;
      }

      finalMap.set(item.id, item);
      finalSeenTitles.add(normalTitle);
    }

    const finalUniqueItems = Array.from(finalMap.values());

    // データベースに保存（Vercel等のリードオンリー環境ではエラーを無視）
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(finalUniqueItems, null, 2));
    } catch (e) {
      console.warn('Local DB write warning (Vercel serverless environment):', e);
    }

    // クライアントへ返すデータは期間内のものだけに絞る
    let returnItems = finalUniqueItems;
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate + 'T00:00:00').getTime() : 0;
      const end   = endDate   ? new Date(endDate   + 'T23:59:59.999').getTime() : Infinity;
      returnItems = returnItems.filter(item => {
        const pubTime = new Date(item.pubDate).getTime();
        return pubTime >= start && pubTime <= end;
      });
    }

    return NextResponse.json({
      success: true,
      count: returnItems.length,
      data: returnItems
    });

  } catch (error) {

    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
