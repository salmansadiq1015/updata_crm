// Generate data for last 12 months (default)
export const generateLast12MonthData = async (model) => {
    const last12Months = [];
    const currentDate = new Date();
  
    currentDate.setDate(currentDate.getDate() + 1);
  
    for (let i = 11; i >= 0; i--) {
      const endDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate() - i * 28
      );
  
      const startDate = new Date(
        endDate.getFullYear(),
        endDate.getMonth(),
        endDate.getDate() - 28
      );
  
      const monthYear = endDate.toLocaleString("default", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
  
      const count = await model.countDocuments({
        createdAt: {
          $gte: startDate,
          $lt: endDate,
        },
      });
  
      last12Months.push({ month: monthYear, count });
    }
    return { last12Months };
  };
  
  // Generate data for specific year (monthly breakdown)
  export const generateYearlyData = async (model, year) => {
    const monthlyData = [];
    const targetYear = parseInt(year) || new Date().getFullYear();
  
    for (let month = 0; month < 12; month++) {
      const startDate = new Date(targetYear, month, 1);
      const endDate = new Date(targetYear, month + 1, 1);
  
      const monthYear = startDate.toLocaleString("default", {
        month: "short",
        year: "numeric",
      });
  
      const count = await model.countDocuments({
        createdAt: {
          $gte: startDate,
          $lt: endDate,
        },
      });
  
      monthlyData.push({ month: monthYear, count });
    }
    return { last12Months: monthlyData };
  };
  
  // Generate data for specific month (daily breakdown)
  export const generateMonthlyData = async (model, year, month) => {
    const dailyData = [];
    const targetYear = parseInt(year) || new Date().getFullYear();
    const targetMonth = parseInt(month) - 1 || new Date().getMonth(); // month is 0-indexed
  
    const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  
    for (let day = 1; day <= daysInMonth; day++) {
      const startDate = new Date(targetYear, targetMonth, day);
      const endDate = new Date(targetYear, targetMonth, day + 1);
  
      const dayLabel = startDate.toLocaleString("default", {
        day: "numeric",
        month: "short",
      });
  
      const count = await model.countDocuments({
        createdAt: {
          $gte: startDate,
          $lt: endDate,
        },
      });
  
      dailyData.push({ month: dayLabel, count });
    }
    return { last12Months: dailyData };
  };
  
  // Generate data for custom date range
  export const generateCustomRangeData = async (model, startDate, endDate) => {
    const rangeData = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
  
    // Calculate days difference
    const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  
    if (daysDiff <= 31) {
      for (let i = 0; i < daysDiff; i++) {
        const currentDate = new Date(start);
        currentDate.setDate(currentDate.getDate() + i);
        const nextDate = new Date(currentDate);
        nextDate.setDate(nextDate.getDate() + 1);
  
        const dayLabel = currentDate.toLocaleString("default", {
          day: "numeric",
          month: "short",
        });
  
        const count = await model.countDocuments({
          createdAt: {
            $gte: currentDate,
            $lt: nextDate,
          },
        });
  
        rangeData.push({ month: dayLabel, count });
      }
    } else {
      // For longer ranges, show weekly breakdown
      const weeks = Math.ceil(daysDiff / 7);
      for (let i = 0; i < weeks; i++) {
        const weekStart = new Date(start);
        weekStart.setDate(weekStart.getDate() + i * 7);
        let weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        if (weekEnd > end) weekEnd = new Date(end);
  
        const weekLabel = `Week ${i + 1} (${weekStart.toLocaleDateString(
          "default",
          {
            day: "numeric",
            month: "short",
          }
        )} - ${weekEnd.toLocaleDateString("default", {
          day: "numeric",
          month: "short",
        })})`;
  
        const count = await model.countDocuments({
          createdAt: {
            $gte: weekStart,
            $lt: weekEnd,
          },
        });
  
        rangeData.push({ month: weekLabel, count });
      }
    }
  
    return { last12Months: rangeData };
  };
  