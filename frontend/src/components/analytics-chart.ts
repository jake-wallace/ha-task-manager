import * as echarts from "echarts";
import { LitElement, css, html } from "lit";
import { customElement, property, query } from "lit/decorators.js";

export interface AnalyticsChartSeries {
  name: string;
  values: number[];
}

export interface AnalyticsChartSlice {
  name: string;
  value: number;
}

export interface AnalyticsChartConfig {
  kind: "line" | "donut";
  title: string;
  subtitle?: string;
  categories?: string[];
  series?: AnalyticsChartSeries[];
  slices?: AnalyticsChartSlice[];
}

@customElement("task-manager-analytics-chart")
export class AnalyticsChart extends LitElement {
  @property({ attribute: false }) public config: AnalyticsChartConfig | null = null;

  @query(".chart-root") private chartRoot!: HTMLDivElement;

  private chart: echarts.ECharts | null = null;

  private resizeObserver: ResizeObserver | null = null;

  static styles = css`
    :host {
      display: block;
      min-height: 320px;
      border-radius: 22px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(245, 247, 240, 0.94));
      border: 1px solid rgba(48, 79, 53, 0.09);
      overflow: hidden;
    }

    :host([data-kind="donut"]) {
      min-height: 280px;
    }

    .chart-root {
      width: 100%;
      height: 100%;
      min-height: inherit;
    }
  `;

  protected render() {
    this.toggleAttribute("data-kind", this.config?.kind === "donut");
    return html`<div class="chart-root"></div>`;
  }

  protected firstUpdated(): void {
    this.chart = echarts.init(this.chartRoot);
    this.resizeObserver = new ResizeObserver(() => {
      this.chart?.resize();
    });
    this.resizeObserver.observe(this.chartRoot);
    this.syncChart();
  }

  protected updated(): void {
    this.syncChart();
  }

  public disconnectedCallback(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.chart?.dispose();
    this.chart = null;
    super.disconnectedCallback();
  }

  private syncChart(): void {
    if (!this.chart || !this.config) {
      return;
    }

    if (this.config.kind === "donut") {
      this.chart.setOption(
        {
          backgroundColor: "transparent",
          title: {
            text: this.config.title,
            subtext: this.config.subtitle,
            left: 20,
            top: 18,
            textStyle: {
              color: "#203126",
              fontWeight: 700,
              fontSize: 16
            },
            subtextStyle: {
              color: "#617161",
              fontSize: 11
            }
          },
          color: ["#3e8a57", "#d89a2b", "#c35c43", "#7a8f68"],
          tooltip: {
            trigger: "item"
          },
          legend: {
            bottom: 10,
            left: "center",
            textStyle: {
              color: "#506050"
            }
          },
          series: [
            {
              name: this.config.title,
              type: "pie",
              radius: ["52%", "76%"],
              center: ["50%", "52%"],
              avoidLabelOverlap: true,
              itemStyle: {
                borderColor: "#f8faf6",
                borderWidth: 3
              },
              label: {
                color: "#314234",
                formatter: "{b}\n{c}"
              },
              data: this.config.slices ?? []
            }
          ]
        },
        true
      );
      requestAnimationFrame(() => this.chart?.resize());
      return;
    }

    this.chart.setOption(
      {
        backgroundColor: "transparent",
        color: ["#2f6b47", "#84a25c", "#d89a2b"],
        title: {
          text: this.config.title,
          subtext: this.config.subtitle,
          left: 20,
          top: 18,
          textStyle: {
            color: "#203126",
            fontWeight: 700,
            fontSize: 16
          },
          subtextStyle: {
            color: "#617161",
            fontSize: 11
          }
        },
        tooltip: {
          trigger: "axis"
        },
        grid: {
          left: 18,
          right: 18,
          top: 86,
          bottom: 36,
          containLabel: true
        },
        xAxis: {
          type: "category",
          boundaryGap: false,
          data: this.config.categories ?? [],
          axisLabel: {
            color: "#617161"
          },
          axisLine: {
            lineStyle: {
              color: "rgba(67, 93, 72, 0.2)"
            }
          }
        },
        yAxis: {
          type: "value",
          minInterval: 1,
          axisLabel: {
            color: "#617161"
          },
          splitLine: {
            lineStyle: {
              color: "rgba(67, 93, 72, 0.12)"
            }
          }
        },
        series: (this.config.series ?? []).map((series) => ({
          name: series.name,
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 8,
          lineStyle: {
            width: 3
          },
          areaStyle: {
            opacity: 0.16
          },
          data: series.values
        }))
      },
      true
    );
    requestAnimationFrame(() => this.chart?.resize());
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "task-manager-analytics-chart": AnalyticsChart;
  }
}