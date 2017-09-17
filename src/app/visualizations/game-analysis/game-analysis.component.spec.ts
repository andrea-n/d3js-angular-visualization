import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { GameAnalysisComponent } from './game-analysis.component';

describe('GameAnalysisComponent', () => {
  let component: GameAnalysisComponent;
  let fixture: ComponentFixture<GameAnalysisComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ GameAnalysisComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(GameAnalysisComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
