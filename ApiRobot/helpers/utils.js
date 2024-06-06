const History = require("../models/entity/History");
const moment = require('moment'); 

exports.sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

exports.getPieChart = ({ totalPieces, palatizedPieces }) => {
  return `
    Highcharts.chart('container1', {
      chart: {
        type: 'pie',
      },
      title: {
        text: 'Diagramme circulaire',
      },
      series: [{
        name: 'Pièces',
        data: [
          { name: 'Total Pieces', y: ${totalPieces}, color: '#00aaff' },
          { name: 'Palatized Pieces', y: ${palatizedPieces}, color: '#0055aa' }
        ],
      }],
      plotOptions: {
        pie: {
          dataLabels: {
            format: '{point.name}: {point.percentage:.1f}%',
          },
        },
      },
    });
    `
}

exports.getColumnChart = ({ previousMonth, currentMonth }) => {
  return `
    Highcharts.chart('container2', {
        chart: {
          type: 'column',
        },
        title: {
          text: 'Statistique un seul robot',
        },
        xAxis: {
          categories: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'],
        },
        yAxis: {
          title: {
            text: 'Nombres des pièces',
          },
        },
        series: [{
          name: 'Le mois dernier',
          data: [${previousMonth.join(', ')}],
          color: '#00aaff'
        }, {
          name: 'Ce mois-ci',
          data: [${currentMonth.join(', ')}],
          color: '#0055aa'
        }],
      });
    `
}

exports.getAreaChart = ({ weeklyPreviousMonth, weeklyCurrentMonth }) => {
  return `
    Highcharts.chart('container3', {
        chart: {
          type: 'area'
        },
        title: {
          text: 'Analyse un seul robot',
        },
        xAxis: {
          categories: ['Semaine 1', 'Semaine 2', 'Semaine 3', 'Semaine 4'],
        },
        yAxis: {
          title: {
            text: 'Nombres de fardeaux',
          },
        },
        tooltip: {
          shared: true,
          valueSuffix: ' fardeaux'
        },
        series: [{
          name: 'Le mois dernier',
          data: [${weeklyPreviousMonth.join(', ')}],
          color: '#00aaff'
        }, {
          name: 'Ce mois-ci',
          data: [${weeklyCurrentMonth.join(', ')}],
          color: '#0055aa'
        }],
      });
    `
}

exports.getDailyStats = async (robot) => {
  const startOfCurrentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const startOfPreviousMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);

  const histories = await History.aggregate([
    { $match: { robotId: robot._id, startExecutionAt: { $gte: startOfPreviousMonth } } },
    {
      $addFields: {
        dayOfWeek: { $dayOfWeek: "$startExecutionAt" },
        dateWithoutTime: {
          $dateToString: { format: "%Y-%m-%d", date: "$startExecutionAt" }
        },
        month: { $month: "$startExecutionAt" },
        year: { $year: "$startExecutionAt" }
      }
    },
    {
      $facet: {
        dailyPreviousMonth: [
          { $match: { month: startOfPreviousMonth.getMonth() + 1, year: startOfPreviousMonth.getFullYear() } },
          {
            $group: {
              _id: { date: "$dateWithoutTime", dayOfWeek: "$dayOfWeek" },
              totalPalatizedPieces: { $sum: "$palatizedPieces" }
            }
          },
          { $sort: { "_id.date": 1 } }
        ],
        dailyCurrentMonth: [
          { $match: { month: startOfCurrentMonth.getMonth() + 1, year: startOfCurrentMonth.getFullYear() } },
          {
            $group: {
              _id: { date: "$dateWithoutTime", dayOfWeek: "$dayOfWeek" },
              totalPalatizedPieces: { $sum: "$palatizedPieces" }
            }
          },
          { $sort: { "_id.date": 1 } }
        ]
      }
    }
  ]);

  if (histories.length === 0) {
    return res.status(404).json({ message: "No history found for this robot" });
  }
  const history = histories[0];

  const chartStats = processChartData({
    dailyPreviousMonth: history.dailyPreviousMonth.map(d => ({
      dayOfWeek: d._id.dayOfWeek,
      date: d._id.date,
      stringDate: new Date(d._id.date).toLocaleDateString('fr-FR', { weekday: 'long' }),
      totalPalatizedPieces: d.totalPalatizedPieces
    })),
    dailyCurrentMonth: history.dailyCurrentMonth.map(d => ({
      dayOfWeek: d._id.dayOfWeek,
      date: d._id.date,
      stringDate: new Date(d._id.date).toLocaleDateString('fr-FR', { weekday: 'long' }),
      totalPalatizedPieces: d.totalPalatizedPieces
    }))
  })

  return chartStats
}

exports.getWeeklyStats = async (robot) => {
  const currentDate = new Date();
  const startOfCurrentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const startOfPreviousMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);

  const histories = await History.aggregate([
    { $match: { robotId: robot._id } },
    {
      $addFields: {
        month: { $month: "$startExecutionAt" },
        year: { $year: "$startExecutionAt" },
        dayOfMonth: { $dayOfMonth: "$startExecutionAt" }
      }
    },
    {
      $facet: {
        weeklyPreviousMonth: [
          { $match: { month: startOfPreviousMonth.getMonth() + 1, year: startOfPreviousMonth.getFullYear() } },
          {
            $group: {
              _id: { $subtract: ["$dayOfMonth", { $mod: [{ $add: [{ $subtract: [{ $dayOfMonth: "$startExecutionAt" }, 1] }, { $dayOfWeek: "$startExecutionAt" }] }, 7] }] },
              totalPalatizedPieces: { $sum: "$palatizedPieces" },
              startExecutionAt: { $first: "$startExecutionAt" } // Include the startExecutionAt date
            }
          },
          { $sort: { _id: 1 } }
        ],
        weeklyCurrentMonth: [
          { $match: { month: startOfCurrentMonth.getMonth() + 1, year: startOfCurrentMonth.getFullYear() } },
          {
            $group: {
              _id: { $subtract: ["$dayOfMonth", { $mod: [{ $add: [{ $subtract: [{ $dayOfMonth: "$startExecutionAt" }, 1] }, { $dayOfWeek: "$startExecutionAt" }] }, 7] }] },
              totalPalatizedPieces: { $sum: "$palatizedPieces" },
              startExecutionAt: { $first: "$startExecutionAt" } // Include the startExecutionAt date
            }
          },
          { $sort: { _id: 1 } }
        ]
      }
    }
  ]);

  const [history] = histories;
  const chartStats = {
    weeklyPreviousMonth: countPalatizedPiecesByWeek(history.weeklyPreviousMonth.map(d => ({
      totalPalatizedPieces: d.totalPalatizedPieces,
      startExecutionAt: d.startExecutionAt
    }))),
    weeklyCurrentMonth: countPalatizedPiecesByWeek(history.weeklyCurrentMonth.map(d => ({
      totalPalatizedPieces: d.totalPalatizedPieces,
      startExecutionAt: d.startExecutionAt
    })))
  };

  return chartStats;
};

function processChartData(data) {
  const dailyStats = {
    previousMonth: new Array(7).fill(0), // Array of 7 zeros for previous month
    currentMonth: new Array(7).fill(0) // Array of 7 zeros for current month
  };

  const days = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

  for (const item of data.dailyPreviousMonth) {
    const dayOfWeek = days[getDayByIndex(days, item.dayOfWeek - 2)]; // Adjust for Monday-based index
    dailyStats.previousMonth[getDayByIndex(days, days.indexOf(dayOfWeek))] = item.totalPalatizedPieces;
  }

  for (const item of data.dailyCurrentMonth) {
    const dayOfWeek = days[item.dayOfWeek - 2]; // Adjust for Monday-based index
    dailyStats.currentMonth[days.indexOf(dayOfWeek)] = item.totalPalatizedPieces;
  }

  return dailyStats;
}

function countPalatizedPiecesByWeek(data) {
  // Initialize an array with 5 positions set to 0
  const weeklyCounts = [0, 0, 0, 0];
  
  // Iterate over the data array
  data.forEach(item => {
    // Determine the week of the month for the given date
    const weekOfMonth = Math.floor(moment(item.startExecutionAt).date() / 7);
    
    // Add the totalPalatizedPieces to the correct week
    weeklyCounts[weekOfMonth] += item.totalPalatizedPieces;
  });
  
  return weeklyCounts;
}


function getDayByIndex(array, index) {
  // Handle negative index
  if (index < 0) {
    index = array.length + index;
  }

  // Return the element at the calculated index
  return index
}