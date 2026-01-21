import { aiGlassAnimations } from '@/components/ui/ai-glass';

export default function CreateLogbookLayout({ children }: { children: React.ReactNode; params: { storeId: string } }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: aiGlassAnimations }} />
      <div style={{ backgroundColor: 'transparent', minHeight: '100vh' }}>
        {children}
      </div>
    </>
  );
}
