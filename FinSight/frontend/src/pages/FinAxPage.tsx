/**
 * FinAx News Feed Page
 * Displays AI-classified news from RSS sources.
 */

import { useState, useEffect } from 'react';
import { Newspaper, RefreshCw, ExternalLink, Filter } from 'lucide-react';
import { API_BASE_URL } from '../config/env';

interface Article {
  title: string;
  link: string;
  source: string;
  published: string;
  category: string;
  summary: string;
  sentiment: string;
}

export default function FinAxPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');

  const fetchFeed = async () => {
    setLoading(true);
    try {
      const url = category
        ? `${API_BASE_URL}/api/finax/feed?limit=100&category=${category}`
        : `${API_BASE_URL}/api/finax/feed?limit=100`;
      const resp = await fetch(url);
      const data = await resp.json();
      setArticles(data.articles || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFeed(); }, [category]);

  const sentimentColor = (s: string) => {
    if (s === 'positive' || s === 'bullish') return 'text-green-400';
    if (s === 'negative' || s === 'bearish') return 'text-red-400';
    return 'text-gray-400';
  };

  const categories = [...new Set(articles.map(a => a.category).filter(Boolean))];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Newspaper className="text-lime-400" size={24} />
            FinAx News Feed
          </h1>
          <p className="text-sm text-gray-400 mt-1">AI-classified financial news from multiple sources</p>
        </div>
        <div className="flex items-center gap-3">
          {categories.length > 0 && (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <button onClick={fetchFeed} className="p-2 hover:bg-gray-800 rounded-lg">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <RefreshCw className="animate-spin text-lime-400" size={32} />
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <Newspaper size={48} className="mx-auto mb-4 opacity-50" />
          <p>No news articles available. Run FinAx engine to generate the feed.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map((a, i) => (
            <div key={i} className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-4 hover:border-gray-600/50 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-medium mb-1">{a.title}</h3>
                  {a.summary && <p className="text-sm text-gray-400 mb-2">{a.summary}</p>}
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{a.source}</span>
                    <span>{a.published ? new Date(a.published).toLocaleDateString() : ''}</span>
                    {a.category && <span className="px-1.5 py-0.5 bg-gray-700 rounded">{a.category}</span>}
                    {a.sentiment && <span className={sentimentColor(a.sentiment)}>{a.sentiment}</span>}
                  </div>
                </div>
                {a.link && (
                  <a href={a.link} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-gray-700 rounded-lg text-gray-400">
                    <ExternalLink size={16} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
