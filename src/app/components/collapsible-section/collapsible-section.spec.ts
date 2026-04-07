import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CollapsibleSectionComponent } from './collapsible-section';
import { describe, it, expect, beforeEach } from 'vitest';
describe('CollapsibleSectionComponent', () => {
  let component: CollapsibleSectionComponent;
  let fixture: ComponentFixture<CollapsibleSectionComponent>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CollapsibleSectionComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(CollapsibleSectionComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('title', 'Test Section');
    fixture.detectChanges();
  });
  it('should create', () => {
    expect(component).toBeTruthy();
  });
  it('should display the title', () => {
    const title = fixture.nativeElement.querySelector('h4');
    expect(title.textContent).toBe('Test Section');
  });
  it('should be open by default', () => {
    expect(component.isOpen()).toBe(true);
  });
  it('should toggle open/close when button is clicked', () => {
    expect(component.isOpen()).toBe(true);
    const button = fixture.nativeElement.querySelector('button');
    button.click();
    fixture.detectChanges();
    expect(component.isOpen()).toBe(false);
    button.click();
    fixture.detectChanges();
    expect(component.isOpen()).toBe(true);
  });
  it('should hide content when closed', () => {
    component.isOpen.set(false);
    fixture.detectChanges();
    const content = fixture.nativeElement.querySelector('.px-4.pb-4');
    expect(content).toBeFalsy();
  });
  it('should show content when open', () => {
    component.isOpen.set(true);
    fixture.detectChanges();
    const content = fixture.nativeElement.querySelector('.px-4.pb-4');
    expect(content).toBeTruthy();
  });
  it('should rotate chevron when open', () => {
    component.isOpen.set(true);
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg');
    expect(svg.classList.contains('rotate-180')).toBe(true);
  });
});
