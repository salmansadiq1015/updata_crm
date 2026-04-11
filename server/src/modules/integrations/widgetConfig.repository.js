import WidgetConfig from './widgetConfig.model.js';

class WidgetConfigRepository {
  async findByWidgetId(widgetId) {
    return WidgetConfig.findOne({ widgetId }).lean();
  }

  async upsert(widgetId, data) {
    return WidgetConfig.findOneAndUpdate(
      { widgetId },
      { ...data, widgetId },
      { new: true, upsert: true, runValidators: true },
    ).lean();
  }
}

const widgetConfigRepository = new WidgetConfigRepository();
export default widgetConfigRepository;
