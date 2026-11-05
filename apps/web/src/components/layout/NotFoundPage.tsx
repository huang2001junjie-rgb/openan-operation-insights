import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { IconArrowRight } from '@/components/icons';

export function NotFoundPage() {
  return (
    <Card className="reveal mx-auto max-w-lg text-center">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-brand-400/90">
        404
      </p>
      <h1 className="mt-3 text-xl font-semibold text-slate-50">页面不存在</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        你访问的地址不在本平台的三个视图之内。可以返回概览页继续浏览。
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-brand-500 to-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:from-brand-400 hover:to-brand-500"
      >
        返回概览
        <IconArrowRight width={16} height={16} />
      </Link>
    </Card>
  );
}
