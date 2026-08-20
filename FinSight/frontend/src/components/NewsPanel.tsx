import { NewsItem } from '../lib/api';
import { ExternalLink, AlertCircle, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface NewsPanelProps {
  newsData: {
    stock_specific: NewsItem[];
    sector_peer: NewsItem[];
    generic: NewsItem[];
    sector?: string | null;
    industry?: string | null;
  } | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  ticker?: string;
}

const SentimentIcon = ({ sentiment }: { sentiment?: string }) => {
  if (sentiment === 'positive') {
    return <TrendingUp size={14} className="text-green-400" />;
  } else if (sentiment === 'negative') {
    return <TrendingDown size={14} className="text-red-400" />;
  }
  return <Minus size={14} className="text-gray-400" />;
};

const NewsItemCard = ({ item, category }: { item: NewsItem; category: string }) => {
  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="border-b border-bloomberg-border pb-3 last:border-0 last:pb-0 hover:bg-bloomberg-panel p-2 rounded-lg transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <a
              href={item.link || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-bloomberg-text hover:text-bloomberg-accent text-sm font-medium flex-1"
            >
              {item.title}
            </a>
            {item.sentiment && (
              <div className="flex items-center gap-1" title={`Sentiment: ${item.sentiment}`}>
                <SentimentIcon sentiment={item.sentiment} />
                {item.sentiment_score !== undefined && (
                  <span className="text-xs text-bloomberg-text-muted">
                    {item.sentiment_score > 0 ? '+' : ''}{item.sentiment_score.toFixed(1)}
                  </span>
                )}
              </div>
            )}
          </div>
          {item.summary && (
            <p className="text-xs text-bloomberg-text-muted mb-2 line-clamp-2">
              {item.summary.replace(/<[^>]*>/g, '')} {/* Strip HTML tags */}
            </p>
          )}
          <div className="flex items-center gap-3 text-xs text-bloomberg-text-muted flex-wrap">
            {item.publisher && <span>{item.publisher}</span>}
            {formatDate(item.provider_time_utc || item.timestamp) && (
              <span>• {formatDate(item.provider_time_utc || item.timestamp)}</span>
            )}
            {item.related_ticker && category === 'sector_peer' && (
              <span className="px-2 py-0.5 bg-bloomberg-dark rounded text-bloomberg-accent">
                {item.related_ticker}
              </span>
            )}
          </div>
        </div>
        {item.link && item.link !== '#' && (
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-bloomberg-text-muted hover:text-bloomberg-accent flex-shrink-0"
          >
            <ExternalLink size={16} />
          </a>
        )}
      </div>
    </div>
  );
};

export default function NewsPanel({ newsData, loading = false, error = null, onRetry, ticker }: NewsPanelProps) {
  if (loading) {
    return (
      <div className="card">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bloomberg-accent mb-4"></div>
          <div className="text-bloomberg-text-muted">Loading news...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="flex flex-col items-center justify-center h-64">
          <AlertCircle size={32} className="text-red-400 mb-4" />
          <div className="text-red-400 mb-4 text-center">{error}</div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-bloomberg-accent text-white rounded-lg hover:bg-bloomberg-accent-hover transition-colors flex items-center gap-2"
            >
              <RefreshCw size={16} />
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!newsData) {
    return (
      <div className="card">
        <div className="text-bloomberg-text-muted text-sm text-center py-8">
          No news data available.
        </div>
      </div>
    );
  }

  const stockSpecific = newsData.stock_specific || [];
  const sectorPeer = newsData.sector_peer || [];
  const generic = newsData.generic || [];
  const totalNews = stockSpecific.length + sectorPeer.length + generic.length;

  if (totalNews === 0) {
    return (
      <div className="card">
        <div className="text-bloomberg-text-muted text-sm text-center py-8">
          No recent news available at the moment.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stock-Specific News */}
      {stockSpecific.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-bloomberg-text">
              Stock-Specific News ({stockSpecific.length})
            </h3>
            <span className="text-xs text-bloomberg-text-muted px-2 py-1 bg-green-500/20 text-green-400 rounded">
              {ticker || 'Company'}
            </span>
          </div>
          <div className="space-y-3">
            {stockSpecific.slice(0, 20).map((item, idx) => (
              <NewsItemCard key={idx} item={item} category="stock_specific" />
            ))}
          </div>
        </div>
      )}

      {/* Sector & Peer News */}
      {sectorPeer.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-bloomberg-text">
              Sector & Peer News ({sectorPeer.length})
            </h3>
            {(newsData.sector || newsData.industry) && (
              <div className="flex gap-2 text-xs">
                {newsData.sector && (
                  <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded">
                    {newsData.sector}
                  </span>
                )}
                {newsData.industry && (
                  <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded">
                    {newsData.industry}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="space-y-3">
            {sectorPeer.slice(0, 20).map((item, idx) => (
              <NewsItemCard key={idx} item={item} category="sector_peer" />
            ))}
          </div>
        </div>
      )}

      {/* Generic News */}
      {generic.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-bloomberg-text">
              General Market News ({generic.length})
            </h3>
          </div>
          <div className="space-y-3">
            {generic.slice(0, 10).map((item, idx) => (
              <NewsItemCard key={idx} item={item} category="generic" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
