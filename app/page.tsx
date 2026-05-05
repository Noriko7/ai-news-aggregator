'use client';

import { useState, useEffect } from 'react';
import { Download, Copy, RefreshCw, FileJson, CheckSquare, Square, MessageSquare } from 'lucide-react';
import * as XLSX from 'xlsx';
import styles from './page.module.css';

type NewsItem = {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  contentSnippet: string;
  source: string;
  isPriority: boolean;
};

export default function Home() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'personal' | 'dept'>('personal');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Date selection states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [lastRange, setLastRange] = useState('');
  
  // Update targets
  const [targetPersonal, setTargetPersonal] = useState(true);
  const [targetDept, setTargetDept] = useState(true);

  // Teams Modal
  const [showTeamsModal, setShowTeamsModal] = useState(false);
  const [teamsPreview, setTeamsPreview] = useState('');

  // Prompt Modal
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [promptText, setPromptText] = useState('');

  const fetchNews = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const res = await fetch(`/api/news?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setNews(json.data);
        if (startDate && endDate) {
          const rangeStr = `${startDate} ～ ${endDate}`;
          setLastRange(rangeStr);
          localStorage.setItem('last_news_range', rangeStr);
        }
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    const savedRange = localStorage.getItem('last_news_range');
    if (savedRange) setLastRange(savedRange);
    
    // Set default dates to past 7 days
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 7);
    
    setStartDate(lastWeek.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
  }, []);

  const toggleSelect = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setSelectedIds(next);
  };

  const selectAll = (currentList: NewsItem[]) => {
    if (currentList.every(i => selectedIds.has(i.id))) {
      const next = new Set(selectedIds);
      currentList.forEach(i => next.delete(i.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      currentList.forEach(i => next.add(i.id));
      setSelectedIds(next);
    }
  };

  const getFilteredNews = () => {
    let list = [...news];
    if (tab === 'dept') {
      // Prioritize then sort by date
      list = list.filter(item => item.isPriority);
    }
    return list;
  };

  const filteredNews = getFilteredNews();
  const selectedNews = filteredNews.filter(it => selectedIds.has(it.id));

  // Helper for filename date range
  const getDateRangeStr = (items: NewsItem[]) => {
    if (items.length === 0) return 'no_date';
    const dates = items.map(i => new Date(i.pubDate).getTime());
    const min = new Date(Math.min(...dates));
    const max = new Date(Math.max(...dates));
    const format = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '');
    return `${format(min)}-${format(max)}`;
  };

  const exportExcel = () => {
    if (selectedNews.length === 0) return alert("エクスポートする記事を選択してください");
    const range = getDateRangeStr(selectedNews);
    const worksheet = XLSX.utils.json_to_sheet(selectedNews.map(n => ({
      '公開日': new Date(n.pubDate).toLocaleDateString('ja-JP'),
      'ソース': n.source,
      'タイトル': n.title,
      'URL': n.link,
      '概要': n.contentSnippet
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "AIニュース");
    XLSX.writeFile(workbook, `ai_news_${range}.xlsx`);
  };

  const exportJSON = () => {
    if (selectedNews.length === 0) return alert("エクスポートする記事を選択してください");
    const range = getDateRangeStr(selectedNews);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(selectedNews, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", `ai_news_${range}.json`);
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const openTeamsPreview = () => {
    if (selectedNews.length === 0) return alert("コピーする記事を選択してください");
    const range = getDateRangeStr(selectedNews);
    const header = `【AIニュース】収集期間: ${range}\n\n`;
    const body = selectedNews.map(n => `■ ${n.title}\n(${n.source} - ${new Date(n.pubDate).toLocaleDateString()})\n${n.link}`).join('\n\n');
    setTeamsPreview(header + body);
    setShowTeamsModal(true);
  };

  const confirmCopyTeams = () => {
    navigator.clipboard.writeText(teamsPreview);
    alert("Teams投稿用にコピーしました！");
    setShowTeamsModal(false);
  };

  const openPromptModal = () => {
    let s = '____-__-__';
    let e = '____-__-__';
    if (selectedNews.length > 0) {
      const dates = selectedNews.map(i => new Date(i.pubDate).getTime());
      const min = new Date(Math.min(...dates));
      const max = new Date(Math.max(...dates));
      const format = (d: Date) => d.toISOString().split('T')[0];
      s = format(min);
      e = format(max);
    }

    const prompt = `添付したJSONファイルにはAIツールの最新ニュース一覧が含まれています。
以下の手順に従い、部内Teams投稿用の文章を作成してください。

⚠️【重要ルール・必ず守ること】
・URLはJSONファイル内の "link" フィールドの値をそのままコピーして使用すること
・Bingで検索したり、URLを自分で作成・推測・変更したりすることは絶対にしない
・"(〇〇 in Bing)" のような注釈をURLに付けない
・出力するURLはJSONの "link" の値のみ、加工なしでそのまま貼り付けること

【手順】
1. JSONファイル内の各記事の "link" フィールドのURLに実際にアクセスし、記事の内容を読み込んでください。
2. 各記事から「どの機能が」「どのように」追加・変更・削除されたかを具体的に把握してください。
3. 把握した内容をもとに、IT部門外のメンバーにも分かる平易な言葉でTeams投稿文を作成してください。

【対象ツール】Copilot / Microsoft 365 Copilot / Google Workspace (GWS) / ChatGPT

【出力条件】
・同じ機能アップデートについて言及している記事が複数ある場合は、内容を1つの項目にまとめて要約し、関連するURLをすべて並べて記載する
・要約しすぎず、何がどう変わったかを明確に伝える
・難しい技術用語はそのまま使わず、業務に即した言葉に置き換える
・プレースホルダー（[タイトル]などの記号）は一切使わない
・出力した文章をそのままTeamsに貼り付けられる完成形にする
・情報がないツールのセクションは省略する
・URLはJSONの "link" の値のみ使用し、絶対に変更しない

【文章スタイル・フォーマットのルール】
・各トピックは ❶❷❸ の番号で区切り、見出しは「何が変わったか」が一目でわかる短い一文にする
・見出しの直下に、変更内容を2〜3文のリード文で平易に説明する
・具体的なメリットや使い方は「🎯 たとえばこんなことができます」「🎯 具体的にできるようになったこと」等の小見出しの下に箇条書きで示す
・アプリごとの説明がある場合は【Word】【Excel】【PowerPoint】のように小見出しを付けて整理する
・注意事項には ⚠️、提供時期には 📅、対象プラン等の補足には 📌 のアイコンを付ける
・ツールカテゴリ間は罫線（──────────────────────────）で区切る
・文末の「💡 今期の注目ポイント」では 🏆 アイコンを使い、業務に最も影響しそうな変更を1〜2点、「なぜ注目か」「まず何を試すべきか」を添えて簡潔にコメントする
・全体を通して「〜できるようになりました」「〜が不要になります」のように、読み手にとっての変化・メリットが伝わる書き方にする

【出力フォーマット（そのままTeamsに貼れる完成形で出力）】

━━━━━━━━━━━━━━━━━━━━━━
📢 AI機能アップデート情報｜${s} 〜 ${e}
━━━━━━━━━━━━━━━━━━━━━━

🔷 Microsoft 365 Copilot

❶ [何が変わったかが一目でわかる短い見出し]
　[変更内容のリード文。2〜3文で平易に説明]

　🎯 たとえばこんなことができます
　　・ [具体例1]
　　・ [具体例2]
　　・ [具体例3]

　⚠️ [注意事項があれば記載]
　📅 [提供時期があれば記載]
　📌 [対象プラン等の補足があれば記載]

　🔗 [JSONのlinkフィールドの値をそのまま記載]
　🔗 [同じ話題の別記事がある場合は2つ目のURLを記載]

──────────────────────────

🔶 Google Workspace（GWS）

❶ [見出し]
　[リード文]

　🎯 [具体例やポイント]
　　・ …

　🔗 [URL]

──────────────────────────

🟢 ChatGPT

❶ [見出し]
　[リード文]

　🎯 [ポイントの小見出し]

　【小カテゴリA】
　　・ …
　【小カテゴリB】
　　・ …

　📌 [補足]

　🔗 [URL]
　🔗 [URL]

──────────────────────────

💡 今期の注目ポイント

🏆 [注目ポイント1のタイトル]
　[なぜ注目か＋まず試すべきことを2〜3文で]

🏆 [注目ポイント2のタイトル]
　[なぜ注目か＋まず試すべきことを2〜3文で]

━━━━━━━━━━━━━━━━━━━━━━
※ 詳細は各リンクをご確認ください。
`;
    setPromptText(prompt);
    setShowPromptModal(true);
  };

  const confirmCopyPrompt = () => {
    navigator.clipboard.writeText(promptText);
    alert('プロンプトをコピーしました！JSONファイルと一緒にAIに貼り付けてください。');
    setShowPromptModal(false);
  };

  const clearAll = () => {
    setNews([]);
    setSelectedIds(new Set());
    setStartDate('');
    setEndDate('');
    setLastRange('');
    setLoading(false);
  };

  const isAllSelected = filteredNews.length > 0 && filteredNews.every(i => selectedIds.has(i.id));

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.title}>AI News Aggregator</h1>
          {lastRange && (
            <div className={styles.lastUpdatedInfo}>
              <CheckSquare size={14} /> 前回: {lastRange}
            </div>
          )}
        </div>
        <p className={styles.subtitle}>生成AIの最新動向を美しく、効率的に。</p>
      </header>

      <div className={styles.updateForm}>
        <div className={styles.formGroup}>
          <label>取得期間</label>
          <div className={styles.inputRow}>
            <input 
              type="date" 
              className={styles.dateInput} 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)} 
            />
            <span className={styles.dateSeparator}>〜</span>
            <input 
              type="date" 
              className={styles.dateInput} 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)} 
            />
          </div>
        </div>
        
        <div className={styles.formGroup}>
          <label>対象ニュース</label>
          <div className={styles.checkboxGroup}>
            <label className={styles.checkItem}>
              <input type="checkbox" checked={targetPersonal} onChange={e => setTargetPersonal(e.target.checked)} />
              個人用
            </label>
            <label className={styles.checkItem}>
              <input type="checkbox" checked={targetDept} onChange={e => setTargetDept(e.target.checked)} />
              部内発信用
            </label>
          </div>
        </div>

        <div className={styles.formActions}>
          <button className={`${styles.actionBtn} ${styles.primary}`} onClick={fetchNews} disabled={loading}>
            <RefreshCw size={16} className={loading ? styles.spinner : ''} />
            {loading ? '収集中...' : 'ニュースを更新'}
          </button>
          <button className={`${styles.actionBtn} ${styles.clearBtn}`} onClick={clearAll} disabled={loading} title="クリア">
            🗑️
          </button>
        </div>
      </div>

      <div className={styles.controlsBar}>
        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${tab === 'personal' ? styles.active : ''}`}
            onClick={() => setTab('personal')}
            style={{ display: targetPersonal ? 'block' : 'none' }}
          >
            個人用ビュー
          </button>
          <button 
            className={`${styles.tab} ${tab === 'dept' ? styles.active : ''}`}
            onClick={() => setTab('dept')}
            style={{ display: targetDept ? 'block' : 'none' }}
          >
            部内発信用ビュー
          </button>
        </div>

        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={() => selectAll(filteredNews)}>
            {isAllSelected ? <CheckSquare size={16} /> : <Square size={16} />}
            全選択
          </button>
          <button className={styles.actionBtn} onClick={openTeamsPreview}>
            <Copy size={16} /> Teams用
          </button>
          <button className={`${styles.actionBtn} ${styles.promptBtn}`} onClick={openPromptModal}>
            <MessageSquare size={16} /> AIプロンプト
          </button>
          <button className={styles.actionBtn} onClick={exportJSON}>
            <FileJson size={16} /> JSON
          </button>
          <button className={`${styles.actionBtn} ${styles.primary}`} onClick={exportExcel}>
            <Download size={16} /> Excel出力
          </button>
        </div>
      </div>

      {loading ? (
        <div className={styles.loader}>
          <div className={styles.spinner}></div>
          <p>記事を取得しています...</p>
        </div>
      ) : (
        <div className={styles.newsGrid}>
          {filteredNews.map(item => {
            const isChecked = selectedIds.has(item.id);
            return (
              <div key={item.id} className={`${styles.card} ${isChecked ? styles.selected : ''}`}>
                <div className={styles.cardHeader}>
                  <div>
                    {item.isPriority && <span className={styles.priorityBadge}>重要トピック</span>}
                    <span className={styles.sourceBadge}>{item.source}</span>
                  </div>
                  <div className={styles.checkboxContainer}>
                    <input 
                      type="checkbox" 
                      className={styles.checkbox}
                      checked={isChecked}
                      onChange={(e) => toggleSelect(item.id, e.target.checked)}
                    />
                  </div>
                </div>
                <h3 className={styles.cardTitle}>
                  <a href={item.link} target="_blank" rel="noopener noreferrer">{item.title}</a>
                </h3>
                <div className={styles.cardDate}>{new Date(item.pubDate).toLocaleString('ja-JP')}</div>
                <div className={styles.cardContent}>{item.contentSnippet}</div>
              </div>
            );
          })}
          {filteredNews.length === 0 && (
            <div className={styles.emptyState}>指定された条件の記事がありません。</div>
          )}
        </div>
      )}

      {/* Teams Preview Modal */}
      {showTeamsModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3>Teams 投稿プレビュー</h3>
              <button className={styles.btnSecondary} onClick={() => setShowTeamsModal(false)}>×</button>
            </div>
            <div className={styles.modalBody}>
              <textarea 
                className={styles.previewArea}
                value={teamsPreview}
                onChange={e => setTeamsPreview(e.target.value)}
              />
              <p style={{fontSize: '0.8rem', color: '#888', marginTop: '8px'}}>※ 必要に応じて内容を調整できます</p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnSecondary} onClick={() => setShowTeamsModal(false)}>キャンセル</button>
              <button className={styles.btnPrimary} onClick={confirmCopyTeams}>コピーを確定する</button>
            </div>
          </div>
        </div>
      )}

      {/* AI Prompt Modal */}
      {showPromptModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{maxWidth: '700px'}}>
            <div className={styles.modalHeader}>
              <h3>🤖 部内発信用 AIプロンプト</h3>
              <button className={styles.btnSecondary} onClick={() => setShowPromptModal(false)}>×</button>
            </div>
            <div className={styles.modalBody}>
              <p style={{fontSize: '0.85rem', color: '#555', marginBottom: '12px'}}>
                📎 JSONファイルをダウンロードし、このプロンプトと一緒に Copilot / ChatGPT / Gemini / Claude に添付してください。
              </p>
              <textarea 
                className={styles.previewArea}
                value={promptText}
                onChange={e => setPromptText(e.target.value)}
                style={{height: '380px', color: '#e0e0e0'}}
              />
              <p style={{fontSize: '0.8rem', color: '#888', marginTop: '8px'}}>※ 必要に応じて内容を調整できます</p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnSecondary} onClick={() => setShowPromptModal(false)}>閉じる</button>
              <button className={styles.btnPrimary} onClick={confirmCopyPrompt}>プロンプトをコピー</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
