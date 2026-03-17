import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RankPlot } from './rank-plot';

describe('RankPlot', () => {
  let component: RankPlot;
  let fixture: ComponentFixture<RankPlot>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RankPlot],
    }).compileComponents();

    fixture = TestBed.createComponent(RankPlot);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
