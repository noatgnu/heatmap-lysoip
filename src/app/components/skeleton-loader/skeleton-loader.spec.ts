import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SkeletonLoaderComponent } from './skeleton-loader';
import { describe, it, expect, beforeEach } from 'vitest';
describe('SkeletonLoaderComponent', () => {
  let component: SkeletonLoaderComponent;
  let fixture: ComponentFixture<SkeletonLoaderComponent>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonLoaderComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(SkeletonLoaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  it('should create', () => {
    expect(component).toBeTruthy();
  });
  it('should render default variant', () => {
    const element = fixture.nativeElement;
    expect(element.querySelector('.animate-pulse')).toBeTruthy();
  });
  it('should render heatmap variant', () => {
    fixture.componentRef.setInput('variant', 'heatmap');
    fixture.detectChanges();
    const element = fixture.nativeElement;
    expect(element.querySelector('.bg-gray-50')).toBeTruthy();
  });
  it('should render tags variant', () => {
    fixture.componentRef.setInput('variant', 'tags');
    fixture.detectChanges();
    const element = fixture.nativeElement;
    expect(element.querySelectorAll('.rounded-full').length).toBeGreaterThan(0);
  });
  it('should render filter variant', () => {
    fixture.componentRef.setInput('variant', 'filter');
    fixture.detectChanges();
    const element = fixture.nativeElement;
    expect(element.querySelectorAll('.h-4.w-4').length).toBeGreaterThan(0);
  });
});
