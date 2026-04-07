import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CurtainFilterComponent } from './curtain-filter';
import { provideHttpClient } from '@angular/common/http';
import { describe, it, expect, beforeEach } from 'vitest';
describe('CurtainFilterComponent', () => {
  let component: CurtainFilterComponent;
  let fixture: ComponentFixture<CurtainFilterComponent>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CurtainFilterComponent],
      providers: [provideHttpClient()]
    })
    .compileComponents();
    fixture = TestBed.createComponent(CurtainFilterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
