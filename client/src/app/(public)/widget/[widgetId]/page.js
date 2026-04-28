import WidgetEmbed from '@/modules/integrations/widget-embed/widget';

export const metadata = { title: 'Kontaktformular' };

export default async function WidgetPage({ params }) {
  const { widgetId } = await params;
  return <WidgetEmbed widgetId={widgetId} />;
}
