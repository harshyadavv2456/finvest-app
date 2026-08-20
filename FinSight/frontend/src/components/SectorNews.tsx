import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { api, NewsItem } from '../lib/api';

interface SectorNewsProps {
  ticker: string;
}

export default function SectorNews({ ticker }: SectorNewsProps) {
  const navigate = useNavigate();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [industry, setIndustry] = useState<string | null>(null);
  const [sector, setSector] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadNews = async () => {
      setLoading(true);
      try {
        const data = await api.getSectorNews(ticker, 30);
        setNews(data.news);
        setIndustry(data.industry);
        setSector(data.sector);
      } catch (error) {
        console.error('Failed to load sector news:', error);
      } finally {
        setLoading(false);
      }
    };

    loadNews();
  }, [ticker]);

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="card">
        <div className="flex items-center justify-center h-64">
          <div className="text-bloomberg-text-muted">Loading sector news...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-bloomberg-text mb-2">Sector & Industry News</h2>
        <div className="text-sm text-bloomberg-text-muted">
          {industry && <span>Industry: {industry}</span>}
          {sector && <span className="ml-4">Sector: {sector}</span>}
        </div>
      </div>

      {news.length === 0 ? (
        <div className="text-bloomberg-text-muted">No sector news available.</div>
      ) : (
        <div className="space-y-4">
          {news.map((item, idx) => (
            <div
              key={idx}
              className="border-b border-bloomberg-border pb-4 last:border-0 last:pb-0"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-bloomberg-text font-medium mb-2 hover:text-bloomberg-accent cursor-pointer">
                    {item.link ? (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-2"
                      >
                        <span>{item.title}</span>
                        <ExternalLink size={14} className="mt-1 flex-shrink-0" />
                      </a>
                    ) : (
                      item.title
                    )}
                  </h3>
                  {item.summary && (
                    <p className="text-sm text-bloomberg-text-muted mb-2 line-clamp-2">
                      {item.summary}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-bloomberg-text-muted">
                    {item.publisher && <span>{item.publisher}</span>}
                    {item.ticker && (
                      <button
                        onClick={() => navigate(`/stock/${item.ticker}`)}
                        className="text-bloomberg-accent hover:underline"
                      >
                        {item.ticker}
                      </button>
                    )}
                    {(item.timestamp || item.provider_time_utc) && (
                      <span>{formatDate(item.timestamp || item.provider_time_utc)}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

