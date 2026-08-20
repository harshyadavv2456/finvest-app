import { useState } from 'react';
import { X, Plus } from 'lucide-react';

interface FilterRule {
  id: string;
  field: string;
  operator: string;
  value: string;
}

interface AdvancedFiltersProps {
  onFiltersChange: (filters: Record<string, any>) => void;
}

const FILTER_FIELDS = [
  { value: 'pe_trailing', label: 'PE Ratio' },
  { value: 'pe_forward', label: 'PE Forward' },
  { value: 'pb_ratio', label: 'P/B Ratio' },
  { value: 'ev_to_ebitda', label: 'EV/EBITDA' },
  { value: 'peg_ratio', label: 'PEG Ratio' },
  { value: 'dividend_yield', label: 'Dividend Yield %' },
  { value: 'roe', label: 'ROE %' },
  { value: 'roa', label: 'ROA %' },
  { value: 'roce', label: 'ROCE %' },
  { value: 'profit_margin', label: 'Net Margin %' },
  { value: 'operating_margin', label: 'Operating Margin %' },
  { value: 'gross_margin', label: 'Gross Margin %' },
  { value: 'debt_to_equity', label: 'Debt/Equity' },
  { value: 'current_ratio', label: 'Current Ratio' },
  { value: 'revenue_growth', label: 'Revenue Growth %' },
  { value: 'earnings_growth', label: 'Earnings Growth %' },
  { value: 'eps_growth_yoy', label: 'EPS Growth YOY %' },
  { value: 'beta', label: 'Beta' },
  { value: 'market_cap', label: 'Market Cap' },
  { value: 'ret_3m', label: '3M Return %' },
  { value: 'ret_1y', label: '1Y Return %' },
  { value: 'fcf_yield', label: 'FCF Yield %' },
  { value: 'analyst_upside', label: 'Analyst Upside %' },
];

const OPERATORS = [
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'eq', label: '=' },
];

export default function AdvancedFilters({ onFiltersChange }: AdvancedFiltersProps) {
  const [rules, setRules] = useState<FilterRule[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const addRule = () => {
    const newRule: FilterRule = {
      id: Date.now().toString(),
      field: 'pe_trailing',
      operator: 'lt',
      value: '',
    };
    setRules([...rules, newRule]);
  };

  const removeRule = (id: string) => {
    setRules(rules.filter(r => r.id !== id));
  };

  const updateRule = (id: string, updates: Partial<FilterRule>) => {
    setRules(rules.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const [isApplying, setIsApplying] = useState(false);

  const applyFilters = async () => {
    if (rules.length === 0) {
      onFiltersChange({});
      return;
    }

    setIsApplying(true);
    
    try {
      const filters: Record<string, any> = {};
      
      // Map frontend field names to backend parameter names
      // Note: Backend uses 'pe' for pe_trailing, 'pb' for pb_ratio
      const fieldMapping: Record<string, string> = {
        'pe_trailing': 'pe',
        'pe_forward': 'pe',
        'pb_ratio': 'pb',
        'ev_to_ebitda': 'ev_to_ebitda',
        'peg_ratio': 'peg_ratio',
        'dividend_yield': 'dividend_yield',
        'roe': 'roe',
        'roa': 'roa',
        'roce': 'roce',
        'profit_margin': 'profit_margin',
        'operating_margin': 'operating_margin',
        'gross_margin': 'gross_margin',
        'debt_to_equity': 'debt_to_equity',
        'current_ratio': 'current_ratio',
        'revenue_growth': 'revenue_growth',
        'earnings_growth': 'earnings_growth',
        'eps_growth_yoy': 'eps_growth_yoy',
        'beta': 'beta',
        'market_cap': 'market_cap',
        'ret_3m': 'ret_3m',
        'ret_1y': 'ret_1y',
        'fcf_yield': 'fcf_yield',
        'analyst_upside': 'analyst_upside',
      };
      
      rules.forEach(rule => {
        if (!rule.value || rule.value.trim() === '') return;
        
        const numValue = parseFloat(rule.value);
        if (isNaN(numValue)) return;
        
        // Map frontend field to backend param name
        const backendField = fieldMapping[rule.field] || rule.field;
        
        // Map operators to min/max params that backend expects
        if (rule.operator === 'lt' || rule.operator === 'lte') {
          // field < value means max_field = value
          const maxKey = `max_${backendField}`;
          if (!filters[maxKey] || numValue < filters[maxKey]) {
            filters[maxKey] = numValue;
          }
        } else if (rule.operator === 'gt' || rule.operator === 'gte') {
          // field > value means min_field = value
          const minKey = `min_${backendField}`;
          if (!filters[minKey] || numValue > filters[minKey]) {
            filters[minKey] = numValue;
          }
        } else if (rule.operator === 'eq') {
          // For equality, set both min and max to the same value
          filters[`min_${backendField}`] = numValue;
          filters[`max_${backendField}`] = numValue;
        }
      });
      
      onFiltersChange(filters);
    } catch (error) {
      console.error('Error applying filters:', error);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="mb-2 md:mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 md:px-4 md:py-2 text-sm md:text-base bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all"
      >
        {isOpen ? '▼ Hide' : '▶ Show'} Advanced Filters
      </button>

      {isOpen && (
        <div className="mt-2 md:mt-4 p-2 md:p-4 bg-bloomberg-panel border border-bloomberg-border rounded-lg max-h-[70vh] md:max-h-none overflow-y-auto">
          <div className="flex items-center justify-between mb-2 md:mb-4">
            <h3 className="text-sm md:text-lg font-semibold text-bloomberg-text">Query Filters</h3>
            <button
              onClick={addRule}
              className="px-2 py-1 md:px-3 md:py-1.5 text-xs md:text-sm bg-bloomberg-accent text-white rounded-md hover:bg-bloomberg-accent-hover flex items-center gap-1 md:gap-2"
            >
              <Plus size={14} className="md:w-4 md:h-4" />
              <span className="hidden md:inline">Add Rule</span>
              <span className="md:hidden">Add</span>
            </button>
          </div>

          <div className="space-y-2 md:space-y-3">
            {rules.map(rule => (
              <div key={rule.id} className="flex flex-col md:flex-row items-stretch md:items-center gap-2 p-2 md:p-3 bg-bloomberg-dark rounded-lg">
                <select
                  value={rule.field}
                  onChange={(e) => updateRule(rule.id, { field: e.target.value })}
                  className="flex-1 md:flex-none px-2 py-1.5 md:px-3 md:py-2 bg-bloomberg-panel border border-bloomberg-border rounded-md text-bloomberg-text text-xs md:text-sm"
                >
                  {FILTER_FIELDS.map(field => (
                    <option key={field.value} value={field.value}>{field.label}</option>
                  ))}
                </select>

                <select
                  value={rule.operator}
                  onChange={(e) => updateRule(rule.id, { operator: e.target.value })}
                  className="w-20 md:w-auto px-2 py-1.5 md:px-3 md:py-2 bg-bloomberg-panel border border-bloomberg-border rounded-md text-bloomberg-text text-xs md:text-sm"
                >
                  {OPERATORS.map(op => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>

                <input
                  type="number"
                  value={rule.value}
                  onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                  placeholder="Value"
                  className="flex-1 px-2 py-1.5 md:px-3 md:py-2 bg-bloomberg-panel border border-bloomberg-border rounded-md text-bloomberg-text text-xs md:text-sm"
                />

                <button
                  onClick={() => removeRule(rule.id)}
                  className="p-2 text-red-400 hover:text-red-300 hover:bg-bloomberg-border rounded-md"
                >
                  <X size={18} />
                </button>
              </div>
            ))}

            {rules.length === 0 && (
              <div className="text-center py-4 md:py-8 text-bloomberg-text-muted text-xs md:text-sm">
                <p>No filters added. Click "Add Rule" to create a filter.</p>
                <p className="text-xs mt-2">Example: PE Ratio &lt; 20, ROCE &gt; 15%</p>
              </div>
            )}
          </div>

          {rules.length > 0 && (
            <div className="mt-2 md:mt-4 flex flex-col sm:flex-row gap-2">
              <button
                onClick={applyFilters}
                disabled={isApplying}
                className="flex-1 sm:flex-none px-4 md:px-6 py-1.5 md:py-2 text-xs md:text-base bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isApplying ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 md:h-4 md:w-4 border-b-2 border-white"></div>
                    <span>Applying...</span>
                  </>
                ) : (
                  'Apply Filters'
                )}
              </button>
              <button
                onClick={() => {
                  setRules([]);
                  onFiltersChange({});
                }}
                className="flex-1 sm:flex-none px-4 md:px-6 py-1.5 md:py-2 text-xs md:text-base bg-bloomberg-dark text-bloomberg-text border border-bloomberg-border rounded-lg font-semibold hover:bg-bloomberg-border transition-all"
              >
                Clear All
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

