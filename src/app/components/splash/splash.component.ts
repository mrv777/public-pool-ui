import { ChangeDetectorRef, Component } from '@angular/core';
import { FormControl } from '@angular/forms';
import { combineLatest, map, Observable, shareReplay, switchMap, interval, startWith } from 'rxjs';

import { environment } from '../../../environments/environment';
import { HashSuffixPipe } from '../../pipes/hash-suffix.pipe';
import { AppService } from '../../services/app.service';
import { bitcoinAddressValidator } from '../../validators/bitcoin-address.validator';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.component.html',
  styleUrls: ['./splash.component.scss']
})
export class SplashComponent {

  private refreshInterval = 60000;

  public address: FormControl;

  public chartData$: Observable<any>;
  public blockData$: Observable<any>;
  public userAgents$: Observable<any>;
  public highScores$: Observable<any>;
  public uptime$: Observable<string>;
  public hashrate$: Observable<number>;

  public lastUpdate$: Observable<Date>;

  public chartOptions: any;

  public stratumURL = '';

  private info$: Observable<any>;

  public networkInfo:any;

  constructor(private appService: AppService, private cdr: ChangeDetectorRef) {

    // Set up an interval to refresh data every 60 seconds
    const refreshInterval$ = interval(this.refreshInterval).pipe(startWith(0));
    
    // Update lastUpdate$ to emit the current date on each refresh
    this.lastUpdate$ = refreshInterval$.pipe(
      map(() => new Date()),
      shareReplay({ refCount: true, bufferSize: 1 })
    );

    // Combine all data fetching into a single observable
    const combinedData$ = refreshInterval$.pipe(
      switchMap(() => combineLatest([
        this.appService.getInfo(),
        this.appService.getInfoChart(),
        this.appService.getNetworkInfo()
      ])),
      shareReplay({ refCount: true, bufferSize: 1 })
    );

    if (environment.STRATUM_URL.length > 1) {
      this.stratumURL = environment.STRATUM_URL;
    } else {
      this.stratumURL = window.location.hostname + ':3333';
    }

    // Update existing observables
    this.info$ = combinedData$.pipe(map(([info, _, __]) => info));
    this.blockData$ = this.info$.pipe(map(info => info.blockData));
    this.userAgents$ = this.info$.pipe(map(info => info.userAgents));
    this.highScores$ = this.info$.pipe(map(info => info.highScores));
    this.uptime$ = this.info$.pipe(map(info => info.uptime));

    // Update chartData$ to use the combined observable
    this.chartData$ = combinedData$.pipe(
      map(([_, chartData, networkInfo]) => {
        this.networkInfo = networkInfo;
        // Filter out extreme points based on comparison with the next point
        const filteredChartData = chartData.filter((point: { data: number }, index: number, array: any[]) => {
          if (index < array.length - 2) {
            const nextPoint = array[index + 1].data;
            const nextNextPoint = array[index + 2].data;
            const ratio = nextPoint / point.data;
            const nextRatio = nextNextPoint / nextPoint;

            // Exclude the current point if its ratio is abnormal and the next ratio is normal
            return !((ratio < 0.7 || ratio > 1.5) && (nextRatio >= 0.7 && nextRatio <= 1.5));
          }
          return true;
        });

        chartData = filteredChartData;

        return {
          labels: chartData.map((d: any) => d.label),
          datasets: [
            {
              label: 'OMBs Hashrate',
              data: chartData.map((d: any) => d.data),
              fill: false,
              backgroundColor: documentStyle.getPropertyValue('--primary-color'),
              borderColor: documentStyle.getPropertyValue('--primary-color'),
              tension: .4,
              pointRadius: 3, // Increased from 1 to 3
              pointHoverRadius: 6, // Increased hover radius for better visibility
              borderWidth: 1
            }
          ]
        }
      })
    );

    // Calculate hashrate based on the last 5 points, removing outliers, and averaging the middle three
    this.hashrate$ = this.chartData$.pipe(
      map(chartData => {
        const data = chartData.datasets[0].data;
        if (data.length >= 5) {
          const lastFivePoints = data.slice(-5);
          const sortedPoints = [...lastFivePoints].sort((a, b) => a - b);
          const middleThree = sortedPoints.slice(1, -1);
          return middleThree.reduce((sum, value) => sum + value, 0) / 3;
        } else {
          return data.slice(-1)[0];
        }
      })
    );
    this.address = new FormControl(null, bitcoinAddressValidator());

    const documentStyle = getComputedStyle(document.documentElement);
    const textColor = documentStyle.getPropertyValue('--text-color');
    const textColorSecondary = documentStyle.getPropertyValue('--text-color-secondary');
    const surfaceBorder = documentStyle.getPropertyValue('--surface-border');

    this.chartOptions = {
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: textColor
          }
        },
        tooltip: { // Updated from 'tooltips' to 'tooltip'
          callbacks: {
            label: function(tooltipItem: any) {
              let label = tooltipItem.dataset.label || '';
              if (label) {
                label += ': ';
              }
              label += HashSuffixPipe.transform(tooltipItem.raw);
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'day', // Set the unit to 'minute'
          },
          ticks: {
            color: textColorSecondary
          },
          grid: {
            color: surfaceBorder,
            drawBorder: false,
            display: true
          }
        },
        y: {
          ticks: {
            color: textColorSecondary,
            // callback: (value: number) => {
            //     return HashSuffixPipe.transform(value) + " - " + AverageTimeToBlockPipe.transform(value, this.networkInfo.difficulty);
            // }
            callback: (value: number) => {
              return HashSuffixPipe.transform(value);
          }
          },
          grid: {
            color: surfaceBorder,
            drawBorder: false
          },
          type: 'logarithmic',
        }
      }
    };
  }
}
