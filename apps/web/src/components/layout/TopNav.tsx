import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { BrandMark } from './BrandMark';
import { IconActivity, IconCalendar, IconDashboard, IconUsers } from '@/components/icons';

const NAV_ITEMS = [
  { to: '/', label: '概览', hint: '伙伴共建与关键指标', icon: <IconDashboard width={16} height={16} />, end: true },
  { to: '/activity', label: '社区活跃度', hint: '贡献与成果明细', icon: <IconActivity width={16} height={16} />, end: false },
  { to: '/summits', label: '社区参展', hint: '社区参加的行业峰会与展会', icon: <IconCalendar width={16} height={16} />, end: false },
  { to: '/meetings', label: '例会出勤', hint: '例会参会矩阵', icon: <IconUsers width={16} height={16} />, end: false },
];

export function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-950/72 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-6 px-4 sm:px-6 lg:px-8">
        <NavLink to="/" className="flex shrink-0 items-center gap-3" aria-label="OpenAN 运营洞察首页">
          <BrandMark />
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="text-[0.95rem] font-semibold tracking-tight text-white">OpenAN</span>
            <span className="text-[0.7rem] font-medium tracking-wide text-slate-500">运营洞察平台</span>
          </span>
        </NavLink>

        <nav className="no-scrollbar -mx-1 flex flex-1 items-center gap-1 overflow-x-auto px-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'group relative inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm transition-colors duration-200',
                  isActive
                    ? 'bg-white/[0.07] text-white'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn('transition-colors', isActive ? 'text-brand-300' : 'text-slate-500 group-hover:text-slate-300')}>
                    {item.icon}
                  </span>
                  <span className="font-medium">{item.label}</span>
                  <span
                    className={cn(
                      'absolute inset-x-3 -bottom-px h-px rounded-full bg-gradient-to-r from-brand-400/0 via-brand-400/80 to-accent-400/0 transition-opacity duration-300',
                      isActive ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[0.7rem] font-medium text-slate-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400/70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-400" />
            </span>
            数据只读视图
          </span>
        </div>
      </div>
    </header>
  );
}
