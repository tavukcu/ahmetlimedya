/**
 * Ahmetli Medya - Charts Module
 * Dashboard charts with Chart.js
 */

export class DashboardCharts {
  constructor() {
    this.charts = {};
    this.darkTheme = {
      textColor: '#e6edf3',
      gridColor: '#30363d',
      backgroundColor: 'rgba(35, 134, 54, 0.8)',
      borderColor: '#238636'
    };
  }

  getDefaultOptions(type = 'bar') {
    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: this.darkTheme.textColor,
            font: {
              size: 12,
              family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto'
            }
          }
        }
      }
    };

    if (type === 'bar' || type === 'line') {
      baseOptions.scales = {
        x: {
          ticks: { color: this.darkTheme.textColor },
          grid: { color: this.darkTheme.gridColor }
        },
        y: {
          ticks: { color: this.darkTheme.textColor },
          grid: { color: this.darkTheme.gridColor },
          beginAtZero: true
        }
      };
    }

    return baseOptions;
  }

  createCategoryChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || !window.Chart) return null;

    // Destroy existing chart
    if (this.charts[canvasId]) {
      this.charts[canvasId].destroy();
    }

    const categories = Object.keys(data).sort();
    const counts = categories.map(cat => data[cat]);

    this.charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: categories,
        datasets: [{
          label: 'Haber Sayısı',
          data: counts,
          backgroundColor: 'rgba(35, 134, 54, 0.8)',
          borderColor: '#238636',
          borderWidth: 1
        }]
      },
      options: {
        ...this.getDefaultOptions('bar'),
        plugins: {
          ...this.getDefaultOptions('bar').plugins,
          title: {
            display: true,
            text: 'Kategorilere Göre Haber Dağılımı',
            color: this.darkTheme.textColor,
            font: { size: 14, weight: 'bold' }
          }
        }
      }
    });

    return this.charts[canvasId];
  }

  createStatusChart(canvasId, publishedCount, draftCount) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || !window.Chart) return null;

    // Destroy existing chart
    if (this.charts[canvasId]) {
      this.charts[canvasId].destroy();
    }

    this.charts[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Yayında', 'Taslak'],
        datasets: [{
          data: [publishedCount, draftCount],
          backgroundColor: [
            'rgba(35, 134, 54, 0.8)',
            'rgba(139, 148, 158, 0.8)'
          ],
          borderColor: [
            '#238636',
            '#8b949e'
          ],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: this.darkTheme.textColor,
              padding: 15,
              font: { size: 12 }
            }
          },
          title: {
            display: true,
            text: 'Yayın Durumu',
            color: this.darkTheme.textColor,
            font: { size: 14, weight: 'bold' }
          }
        }
      }
    });

    return this.charts[canvasId];
  }

  createTrendChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || !window.Chart) return null;

    // Destroy existing chart
    if (this.charts[canvasId]) {
      this.charts[canvasId].destroy();
    }

    // Generate last 7 days
    const labels = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      labels.push(date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }));
    }

    // Sample data (would come from analytics in real implementation)
    const sampleData = data || [12, 19, 15, 25, 22, 30, 28];

    this.charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Görüntüleme',
          data: sampleData,
          borderColor: '#238636',
          backgroundColor: 'rgba(35, 134, 54, 0.1)',
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#238636',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4
        }]
      },
      options: {
        ...this.getDefaultOptions('line'),
        plugins: {
          ...this.getDefaultOptions('line').plugins,
          title: {
            display: true,
            text: 'Son 7 Gün Trend (Örnek Veri)',
            color: this.darkTheme.textColor,
            font: { size: 14, weight: 'bold' }
          }
        }
      }
    });

    return this.charts[canvasId];
  }

  destroyAll() {
    Object.values(this.charts).forEach(chart => {
      if (chart) chart.destroy();
    });
    this.charts = {};
  }

  destroy(canvasId) {
    if (this.charts[canvasId]) {
      this.charts[canvasId].destroy();
      delete this.charts[canvasId];
    }
  }
}

export default DashboardCharts;
