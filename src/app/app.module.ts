import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppComponent } from './app.component';
import { D3Service } from 'd3-ng2-service';
import { PapaParseService } from 'ngx-papaparse';
import { GameAnalysisComponent } from './visualizations/game-analysis/game-analysis.component';

@NgModule({
  declarations: [
    AppComponent,
    GameAnalysisComponent
  ],
  imports: [
    BrowserModule
  ],
  providers: [D3Service, PapaParseService],
  bootstrap: [AppComponent]
})
export class AppModule { }
