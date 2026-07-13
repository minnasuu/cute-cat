import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';

/* ── Theme toggle button ── */
const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { language } = useLanguage();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark
        ? (language === 'zh' ? '切换到浅色模式' : 'Switch to light mode')
        : (language === 'zh' ? '切换到深色模式' : 'Switch to dark mode')}
      title={isDark
        ? (language === 'zh' ? '切换到浅色模式' : 'Switch to light mode')
        : (language === 'zh' ? '切换到深色模式' : 'Switch to dark mode')}
      className="w-9 h-9 rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-tertiary transition-colors shrink-0"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
};

export default ThemeToggle;
