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
・本文内で使うURLは、必ずJSONの "link" フィールドの値と完全一致させること
・URLの末尾に記号、句読点、注釈、スペースを追加しないこと
・記事本文を確認できない場合は、推測で内容を補完せず、JSON内の title / contentSnippet / pubDate から分かる範囲に限定して書くこと

【手順】
1. JSONファイル内の各記事の "link" フィールドのURLに実際にアクセスし、記事の内容を読み込んでください。
2. 各記事から「どの機能が」「どのように」追加・変更・削除されたかを具体的に把握してください。
3. 把握した内容をもとに、IT部門外のメンバーにも分かる平易な言葉でTeams投稿文を作成してください。
4. 同じ機能アップデートについて複数の記事がある場合は、1つの項目に統合してください。
5. 最後に、業務への影響が大きそうな変更を「今週の注目ポイント」として1〜2点だけ選んでください。

【対象ツール】
Copilot / Microsoft 365 Copilot / Google Workspace（GWS） / ChatGPT

【出力条件】
・同じ機能アップデートについて言及している記事が複数ある場合は、内容を1つの項目にまとめて要約し、関連するURLをすべて並べて記載する
・要約しすぎず、何がどう変わったかを明確に伝える
・難しい技術用語はそのまま使わず、業務に即した言葉に置き換える
・プレースホルダー（[タイトル]などの記号）は一切使わない
・出力した文章をそのままTeamsに貼り付けられる完成形にする
・情報がないツールのセクション省略する
・URLはJSONの "link" の値のみ使用し、絶対に変更しない
・記事内容が「単なる紹介記事」「使い方解説」「比較記事」であり、明確な新機能アップデートではない場合は、無理に新機能として扱わない
・部内メンバーが「自分の業務でどう使えそうか」をイメージできる表現にする

【文章スタイル・フォーマットのルール】
・Teams投稿で読みやすいように、主要タイトル、ツール名、各トピック見出し、注目ポイントのタイトルは **太字** にする
・各トピックは ❶❷❸ の番号で区切る
・各トピックの見出しは「何が変わったか」が一目でわかる短い一文にする
・見出しの直下に、変更内容を2〜3文のリード文で平易に説明する
・具体的なメリットや使い方は「🎯 たとえばこんなことができます」「🎯 具体的にできるようになったこと」等の小見出しの下に箇条書きで示す
・アプリごとの説明がある場合は【Word】【Excel】【PowerPoint】【Teams】【Gmail】【スプレッドシート】のように小見出しを付けて整理する
・注意事項には ⚠️、提供時期には 📅、対象プラン等の補足には 📌 のアイコンを付ける
・注意事項、提供時期、対象プランの情報が確認できない場合は、無理に書かず省略する
・ツールカテゴリ間は罫線（──────────────────────────）で区切る
・文末の「💡 今週の注目ポイント」では 🏆 アイコンを使い、業務に最も影響しそうな変更を1〜2点、「なぜ注目か」「まず何を試すべきか」を添えて簡潔にコメントする
・全体を通して「〜できるようになりました」「〜が不要になります」「〜しやすくなります」のように、読み手にとっての変化・メリットが伝わる書き方にする
・社内の部内発信として自然なトーンにし、煽りすぎず、分かりやすく簡潔にまとめる
・IT部門外のメンバーにも伝わるように、専門用語はできるだけ避ける
・1項目あたり長くなりすぎないようにしつつ、変更内容は具体的に書く

【冒頭コメント】
必ず以下の文章を、タイトルの前にそのまま入れてください。

今週の生成AI関連アップデートをお届けします。
この投稿では、Copilot / Google Workspace / ChatGPT などの最新情報から、日常業務に関係しそうな変更点をピックアップして共有します。
資料作成、情報整理、会議準備、Excel作業などで使えそうな機能があれば、ぜひ試してみてください。

【出力フォーマット】
以下の形式で、そのままTeamsに貼り付けられる完成形で出力してください。

今週の生成AI関連アップデートをお届けします。
この投稿では、Copilot / Google Workspace / ChatGPT などの最新情報から、日常業務に関係しそうな変更点を毎週ピックアップして共有します。
資料作成、情報整理、会議準備、Excel作業などで使えそうな機能があれば、ぜひ試してみてください。

━━━━━━━━━━━━━━━━━━━━━━
📢 **AI機能アップデート情報｜${s} 〜 ${e}**
━━━━━━━━━━━━━━━━━━━━━━

🔷 **Microsoft 365 Copilot**

❶ **何が変わったかが一目でわかる短い見出し**
　変更内容のリード文。2〜3文で、IT部門外のメンバーにも分かるように平易に説明する。

　🎯 たとえばこんなことができます
　　・具体例1
　　・具体例2
　　・具体例3

　⚠️ 注意事項があれば記載
　📅 提供時期があれば記載
　📌 対象プラン等の補足があれば記載

　🔗 JSONのlinkフィールドの値をそのまま記載
　🔗 同じ話題の別記事がある場合は2つ目のURLを記載

❷ **何が変わったかが一目でわかる短い見出し**
　変更内容のリード文。2〜3文で、業務上の変化が分かるように説明する。

　🎯 具体的にできるようになったこと
　　・具体例1
　　・具体例2
　　・具体例3

　⚠️ 注意事項があれば記載
　📅 提供時期があれば記載
　📌 対象プラン等の補足があれば記載

　🔗 JSONのlinkフィールドの値をそのまま記載

──────────────────────────

🔶 **Google Workspace（GWS）**

❶ **何が変わったかが一目でわかる短い見出し**
　変更内容のリード文。2〜3文で、業務上の変化が分かるように説明する。

　🎯 たとえばこんなことができます
　　・具体例1
　　・具体例2
　　・具体例3

　⚠️ 注意事項があれば記載
　📅 提供時期があれば記載
　📌 対象プラン等の補足があれば記載

　🔗 JSONのlinkフィールドの値をそのまま記載
　🔗 同じ話題の別記事がある場合は2つ目のURLを記載

──────────────────────────

🟢 **ChatGPT**

❶ **何が変わったかが一目でわかる短い見出し**
　変更内容のリード文。2〜3文で、業務や資料作成にどう役立つかが分かるように説明する。

　🎯 具体的にできるようになったこと

　【小カテゴリA】
　　・具体例1
　　・具体例2

　【小カテゴリB】
　　・具体例1
　　・具体例2

　⚠️ 注意事項があれば記載
　📅 提供時期があれば記載
　📌 対象プラン等の補足があれば記載

　🔗 JSONのlinkフィールドの値をそのまま記載
　🔗 同じ話題の別記事がある場合は2つ目のURLを記載

──────────────────────────

💡 **今週の注目ポイント**

🏆 **注目ポイント1のタイトル**
　なぜ注目すべきかを2〜3文で説明する。あわせて、部内メンバーがまず試すとよい使い方を具体的に書く。

🏆 **注目ポイント2のタイトル**
　なぜ注目すべきかを2〜3文で説明する。あわせて、部内メンバーがまず試すとよい使い方を具体的に書く。

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
        <h1 className={styles.title}>AI News Aggregator</h1>
        <p className={styles.subtitle}>生成AIの最新動向を美しく、効率的に。</p>
      </header>

      {lastRange && (
        <div className={styles.lastUpdatedInfo}>
          <CheckSquare size={16} /> 前回収集期間: {lastRange}
        </div>
      )}

      <div className={styles.updateForm}>
        <div className={styles.inputRow}>
          <div className={styles.formGroup}>
            <label>開始日</label>
            <input 
              type="date" 
              className={styles.dateInput} 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)} 
            />
          </div>
          <div className={styles.formGroup}>
            <label>終了日</label>
            <input 
              type="date" 
              className={styles.dateInput} 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)} 
            />
          </div>
        </div>
        
        <div className={styles.checkboxGroup}>
          <label className={styles.checkItem}>
            <input type="checkbox" checked={targetPersonal} onChange={e => setTargetPersonal(e.target.checked)} />
            個人用ビュー
          </label>
          <label className={styles.checkItem}>
            <input type="checkbox" checked={targetDept} onChange={e => setTargetDept(e.target.checked)} />
            部内発信用
          </label>
        </div>

        <div className={styles.inputRow}>
          <button className={`${styles.actionBtn} ${styles.primary}`} onClick={fetchNews} disabled={loading}>
            <RefreshCw size={18} className={loading ? styles.spinner : ''} />
            {loading ? '収集中...' : 'ニュースを更新する'}
          </button>
          <button className={`${styles.actionBtn} ${styles.clearBtn}`} onClick={clearAll} disabled={loading}>
            🗑️ クリア
          </button>
        </div>
      </div>

      <div className={styles.tabs}>
        <button 
          className={`${styles.tab} ${tab === 'personal' ? styles.active : ''}`}
          onClick={() => setTab('personal')}
          style={{ display: targetPersonal ? 'block' : 'none' }}
        >
          個人用ビュー (新着順)
        </button>
        <button 
          className={`${styles.tab} ${tab === 'dept' ? styles.active : ''}`}
          onClick={() => setTab('dept')}
          style={{ display: targetDept ? 'block' : 'none' }}
        >
          部内発信用ビュー (優先度順)
        </button>
      </div>

      <div className={styles.actions}>
        <button className={styles.actionBtn} onClick={() => selectAll(filteredNews)}>
          {isAllSelected ? <CheckSquare size={18} /> : <Square size={18} />}
          全選択
        </button>
        <button className={styles.actionBtn} onClick={openTeamsPreview}>
          <Copy size={18} /> Teams用コピー
        </button>
        <button className={`${styles.actionBtn} ${styles.promptBtn}`} onClick={openPromptModal}>
          <MessageSquare size={18} /> AI発信プロンプト
        </button>
        <button className={styles.actionBtn} onClick={exportJSON}>
          <FileJson size={18} /> JSON
        </button>
        <button className={`${styles.actionBtn} ${styles.primary}`} onClick={exportExcel}>
          <Download size={18} /> Excel出力
        </button>
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
                {item.isPriority && (
                  <div className={styles.priorityBadge}>重要トピック</div>
                )}
                <div className={styles.cardHeader}>
                  <div className={styles.sourceBadge}>{item.source}</div>
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
