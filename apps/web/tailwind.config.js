/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // v1.32 浅色主题：原深色语义色全部反转为浅色底 + 深色文字的映射。
        // slate 色阶「语义反转」：原代码里 slate-50~300 是暗底上的主文字（最亮），
        // 映射为浅色主题下的最深墨色；400~600 是次级灰字，映射为中深灰。
        // 明度梯度保持「数字小的更深」，与「数字小 = 更主要的文字」这一用法一致。
        slate: {
          50: '#101a2c',
          100: '#1c2b47',
          200: '#26334d',
          300: '#36455f',
          400: '#55647c',
          500: '#67748a',
          600: '#7c8799',
          700: '#98a1b0',
          800: '#b3bac6',
          900: '#cdd2db',
        },
        // ink 色阶「明度反转」：ink-950 是页面底色（原最深 → 现最浅），
        // 数字越大越深。卡片 / 表头 / 弹层等 `bg-ink-900/850` 处自动变白。
        ink: {
          950: '#eef1f6',
          900: '#ffffff',
          850: '#f8fafc',
          800: '#f1f4f9',
          700: '#e6eaf2',
          600: '#d8dfea',
        },
        brand: {
          50: '#eef6ff',
          100: '#d9ebff',
          200: '#b6d8ff',
          300: '#83bcff',
          400: '#4b96ff',
          500: '#2472f5',
          600: '#1554d6',
          700: '#1243ab',
          800: '#143a86',
          900: '#15346b',
        },
        accent: {
          300: '#7ff0e0',
          400: '#3fdcc6',
          500: '#1bc4ac',
          600: '#0d9d8c',
        },
        violet: {
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        // v1.32 浅色主题：柔和灰阴影替代深色投影
        card: '0 1px 0 0 rgba(255,255,255,0.9) inset, 0 14px 34px -22px rgba(22,35,61,0.18)',
        glow: '0 0 0 1px rgba(36,114,245,0.25), 0 20px 50px -22px rgba(36,114,245,0.35)',
        'glow-accent': '0 0 0 1px rgba(27,196,172,0.25), 0 20px 50px -24px rgba(27,196,172,0.32)',
      },
      backgroundImage: {
        'grid-fade':
          'linear-gradient(to bottom, rgba(22,35,61,0.05) 1px, transparent 1px), linear-gradient(to right, rgba(22,35,61,0.05) 1px, transparent 1px)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-500px 0' },
          '100%': { backgroundPosition: '500px 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.85)', opacity: '0.85' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        'grow-x': {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.55s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.4s ease-out both',
        shimmer: 'shimmer 1.8s linear infinite',
        float: 'float 5s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.2, 0.6, 0.4, 1) infinite',
        'grow-x': 'grow-x 0.9s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};
