import { Component, ElementRef, ViewChild, AfterViewInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSliderModule } from '@angular/material/slider';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

interface DrawingTool {
  type: 'select' | 'rectangle' | 'circle' | 'line' | 'pencil' | 'text';
  name: string;
  icon: string;
}

interface Point {
  x: number;
  y: number;
}

interface DrawingSVGElement {
  id: string;
  type: string;
  element: SVGElement;
  selected: boolean;
}

@Component({
  selector: 'editor',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatToolbarModule,
    MatSliderModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule
  ],
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss']
})
export class EditorComponent implements AfterViewInit {
  @ViewChild('svgCanvas', { static: true }) svgCanvas!: ElementRef<SVGSVGElement>;

  // Reactive state
  currentTool = signal<DrawingTool['type']>('select');
  strokeWidth = signal(2);
  fillColor = signal('#3f51b5');
  strokeColor = signal('#000000');
  isDrawing = signal(false);
  isDarkTheme = signal(false);
  
  // Drawing state
  private startPoint: Point = { x: 0, y: 0 };
  private currentElement: Element | null = null;
  private elements: DrawingSVGElement[] = [];
  selectedElements: DrawingSVGElement[] = []; // Made public for template access
  private pencilPath: string = '';
  private isDragging = false;
  private dragOffset: Point = { x: 0, y: 0 };
  
  readonly tools: DrawingTool[] = [
    { type: 'select', name: 'Select', icon: 'near_me' },
    { type: 'rectangle', name: 'Rectangle', icon: 'crop_square' },
    { type: 'circle', name: 'Circle', icon: 'radio_button_unchecked' },
    { type: 'line', name: 'Line', icon: 'remove' },
    { type: 'pencil', name: 'Pencil', icon: 'edit' },
    { type: 'text', name: 'Text', icon: 'text_fields' }
  ];

  readonly colors = ['#3f51b5', '#e91e63', '#9c27b0', '#673ab7', '#2196f3', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722', '#795548', '#9e9e9e', '#607d8b', '#000000', '#ffffff'];

  ngAfterViewInit() {
    this.setupEventListeners();
    // Initialize theme
    document.body.setAttribute('data-theme', this.isDarkTheme() ? 'dark' : 'light');
  }

  private setupEventListeners() {
    const svg = this.svgCanvas.nativeElement;
    
    svg.addEventListener('mousedown', (e) => this.onMouseDown(e));
    svg.addEventListener('mousemove', (e) => this.onMouseMove(e));
    svg.addEventListener('mouseup', (e) => this.onMouseUp(e));
    svg.addEventListener('mouseleave', (e) => this.onMouseUp(e));
    
    // Add click event for select tool
    svg.addEventListener('click', (e) => this.onSvgClick(e));
    
    // Add keyboard event for delete
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  private onKeyDown(event: KeyboardEvent) {
    if (this.currentTool() === 'select' && (event.key === 'Delete' || event.key === 'Backspace')) {
      this.deleteSelected();
    }
  }

  private deleteSelected() {
    this.selectedElements.forEach(sel => {
      if (sel.element.parentNode) {
        sel.element.parentNode.removeChild(sel.element);
      }
    });
    this.selectedElements = [];
  }

  private onSvgClick(event: MouseEvent) {
    if (this.currentTool() !== 'select') return;
    
    // Clear selection if clicking on empty space
    if (event.target === this.svgCanvas.nativeElement) {
      this.clearSelection();
    }
  }

  private handleSelect(event: MouseEvent) {
    const target = event.target as SVGElement;
    
    // Check if this is a drawable element (not background grid or SVG canvas itself)
    if (this.isSelectableElement(target)) {
      this.selectElement(target);
      this.isDragging = true;
      
      // Calculate drag offset for better dragging experience
      const point = this.getMousePosition(event);
      this.dragOffset = {
        x: point.x,
        y: point.y
      };
    } else {
      // Clicked on empty space, clear selection
      this.clearSelection();
    }
  }

  private isSelectableElement(element: SVGElement): boolean {
    // Check if it's a drawable SVG element (not the canvas, background, or definitions)
    const selectableTypes = ['rect', 'circle', 'line', 'path', 'text'];
    const isSelectableType = selectableTypes.includes(element.tagName);
    
    // Make sure it's not the background grid
    const isBackgroundGrid = element.getAttribute('fill') === 'url(#grid)' || 
                            element.getAttribute('width') === '100%' ||
                            element.tagName === 'defs' ||
                            element.tagName === 'pattern';
    
    // Make sure it's not the SVG canvas itself
    const isSvgCanvas = element === this.svgCanvas.nativeElement;
    
    return isSelectableType && !isBackgroundGrid && !isSvgCanvas;
  }

  private handleSelectMove(point: Point) {
    if (this.isDragging && this.selectedElements.length > 0) {
      this.dragSelectedElements(point);
    }
  }

  private selectElement(element: SVGElement) {
    // Clear previous selection
    this.clearSelection();
    
    // Add selection styling
    element.classList.add('selected');
    element.style.filter = 'drop-shadow(0 0 3px #2196f3)';
    
    // Store selected element
    this.selectedElements = [{
      id: this.generateId(),
      type: element.tagName,
      element: element,
      selected: true
    }];
  }

  private clearSelection() {
    this.selectedElements.forEach(sel => {
      sel.element.classList.remove('selected');
      (sel.element as any).style.filter = '';
    });
    this.selectedElements = [];
  }

  private dragSelectedElements(point: Point) {
    const dx = point.x - this.dragOffset.x;
    const dy = point.y - this.dragOffset.y;
    
    this.selectedElements.forEach(sel => {
      const element = sel.element;
      
      switch (element.tagName) {
        case 'rect':
          const currentX = parseFloat(element.getAttribute('x') || '0');
          const currentY = parseFloat(element.getAttribute('y') || '0');
          element.setAttribute('x', (currentX + dx).toString());
          element.setAttribute('y', (currentY + dy).toString());
          break;
        case 'circle':
          const currentCx = parseFloat(element.getAttribute('cx') || '0');
          const currentCy = parseFloat(element.getAttribute('cy') || '0');
          element.setAttribute('cx', (currentCx + dx).toString());
          element.setAttribute('cy', (currentCy + dy).toString());
          break;
        case 'line':
          const x1 = parseFloat(element.getAttribute('x1') || '0');
          const y1 = parseFloat(element.getAttribute('y1') || '0');
          const x2 = parseFloat(element.getAttribute('x2') || '0');
          const y2 = parseFloat(element.getAttribute('y2') || '0');
          
          element.setAttribute('x1', (x1 + dx).toString());
          element.setAttribute('y1', (y1 + dy).toString());
          element.setAttribute('x2', (x2 + dx).toString());
          element.setAttribute('y2', (y2 + dy).toString());
          break;
        case 'text':
          const currentTextX = parseFloat(element.getAttribute('x') || '0');
          const currentTextY = parseFloat(element.getAttribute('y') || '0');
          element.setAttribute('x', (currentTextX + dx).toString());
          element.setAttribute('y', (currentTextY + dy).toString());
          break;
        case 'path':
          // For path elements (pencil drawings), translate the entire path
          const pathData = element.getAttribute('d') || '';
          if (pathData) {
            const newPath = this.translatePath(pathData, dx, dy);
            element.setAttribute('d', newPath);
          }
          break;
      }
    });
    
    // Update the drag offset for the next move
    this.dragOffset = point;
  }

  private translatePath(pathData: string, dx: number, dy: number): string {
    // Enhanced path translation that handles both M (move) and L (line) commands
    return pathData.replace(/([ML])\s*([-\d.]+)\s*([-\d.]+)/g, (match, command, x, y) => {
      const newX = parseFloat(x) + dx;
      const newY = parseFloat(y) + dy;
      return `${command} ${newX} ${newY}`;
    });
  }

  private generateId(): string {
    return 'element-' + Math.random().toString(36).substr(2, 9);
  }

  private getMousePosition(event: MouseEvent): Point {
    const svg = this.svgCanvas.nativeElement;
    const rect = svg.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  onMouseDown(event: MouseEvent) {
    const point = this.getMousePosition(event);
    this.startPoint = point;
    this.isDrawing.set(true);

    switch (this.currentTool()) {
      case 'select':
        this.handleSelect(event);
        break;
      case 'rectangle':
        this.createRectangle(point);
        break;
      case 'circle':
        this.createCircle(point);
        break;
      case 'line':
        this.createLine(point);
        break;
      case 'pencil':
        this.startPencilDrawing(point);
        break;
      case 'text':
        this.createText(point);
        break;
    }
  }

  onMouseMove(event: MouseEvent) {
    if (!this.isDrawing()) return;

    const point = this.getMousePosition(event);

    switch (this.currentTool()) {
      case 'select':
        this.handleSelectMove(point);
        break;
      case 'rectangle':
        this.updateRectangle(point);
        break;
      case 'circle':
        this.updateCircle(point);
        break;
      case 'line':
        this.updateLine(point);
        break;
      case 'pencil':
        this.updatePencilDrawing(point);
        break;
    }
  }

  onMouseUp(event: MouseEvent) {
    this.isDrawing.set(false);
    this.isDragging = false;
    this.currentElement = null;
    
    if (this.currentTool() === 'pencil') {
      this.finalizePencilDrawing();
    }
  }

  private createRectangle(point: Point) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', point.x.toString());
    rect.setAttribute('y', point.y.toString());
    rect.setAttribute('width', '0');
    rect.setAttribute('height', '0');
    rect.setAttribute('fill', this.fillColor());
    rect.setAttribute('stroke', this.strokeColor());
    rect.setAttribute('stroke-width', this.strokeWidth().toString());
    
    this.svgCanvas.nativeElement.appendChild(rect);
    this.currentElement = rect as any;
  }

  private updateRectangle(point: Point) {
    if (!this.currentElement) return;
    
    const width = Math.abs(point.x - this.startPoint.x);
    const height = Math.abs(point.y - this.startPoint.y);
    const x = Math.min(point.x, this.startPoint.x);
    const y = Math.min(point.y, this.startPoint.y);
    
    this.currentElement.setAttribute('x', x.toString());
    this.currentElement.setAttribute('y', y.toString());
    this.currentElement.setAttribute('width', width.toString());
    this.currentElement.setAttribute('height', height.toString());
  }

  private createCircle(point: Point) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', point.x.toString());
    circle.setAttribute('cy', point.y.toString());
    circle.setAttribute('r', '0');
    circle.setAttribute('fill', this.fillColor());
    circle.setAttribute('stroke', this.strokeColor());
    circle.setAttribute('stroke-width', this.strokeWidth().toString());
    
    this.svgCanvas.nativeElement.appendChild(circle);
    this.currentElement = circle as any;
  }

  private updateCircle(point: Point) {
    if (!this.currentElement) return;
    
    const radius = Math.sqrt(
      Math.pow(point.x - this.startPoint.x, 2) + 
      Math.pow(point.y - this.startPoint.y, 2)
    );
    
    this.currentElement.setAttribute('r', radius.toString());
  }

  private createLine(point: Point) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', point.x.toString());
    line.setAttribute('y1', point.y.toString());
    line.setAttribute('x2', point.x.toString());
    line.setAttribute('y2', point.y.toString());
    line.setAttribute('stroke', this.strokeColor());
    line.setAttribute('stroke-width', this.strokeWidth().toString());
    
    this.svgCanvas.nativeElement.appendChild(line);
    this.currentElement = line as any;
  }

  private updateLine(point: Point) {
    if (!this.currentElement) return;
    
    this.currentElement.setAttribute('x2', point.x.toString());
    this.currentElement.setAttribute('y2', point.y.toString());
  }

  private startPencilDrawing(point: Point) {
    this.pencilPath = `M ${point.x} ${point.y}`;
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', this.pencilPath);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', this.strokeColor());
    path.setAttribute('stroke-width', this.strokeWidth().toString());
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    
    this.svgCanvas.nativeElement.appendChild(path);
    this.currentElement = path as any;
  }

  private updatePencilDrawing(point: Point) {
    if (!this.currentElement) return;
    
    this.pencilPath += ` L ${point.x} ${point.y}`;
    this.currentElement.setAttribute('d', this.pencilPath);
  }

  private finalizePencilDrawing() {
    this.pencilPath = '';
  }

  private createText(point: Point) {
    const text = prompt('Enter text:');
    if (!text) return;
    
    const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textElement.setAttribute('x', point.x.toString());
    textElement.setAttribute('y', point.y.toString());
    textElement.setAttribute('fill', this.fillColor());
    textElement.setAttribute('font-size', '16');
    textElement.textContent = text;
    
    this.svgCanvas.nativeElement.appendChild(textElement);
  }

  selectTool(tool: DrawingTool['type']) {
    this.currentTool.set(tool);
  }

  setStrokeWidth(width: number) {
    this.strokeWidth.set(width);
  }

  setFillColor(color: string) {
    this.fillColor.set(color);
  }

  setStrokeColor(color: string) {
    this.strokeColor.set(color);
  }

  clearCanvas() {
    const svg = this.svgCanvas.nativeElement;
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    this.elements = [];
    this.selectedElements = [];
  }

  exportSVG() {
    const svg = this.svgCanvas.nativeElement;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'drawing.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
  }

  undo() {
    const svg = this.svgCanvas.nativeElement;
    const lastChild = svg.lastElementChild;
    if (lastChild) {
      svg.removeChild(lastChild);
    }
  }

  getCurrentToolName(): string {
    return this.tools.find(t => t.type === this.currentTool())?.name || 'Unknown';
  }

  toggleTheme() {
    this.isDarkTheme.update(value => !value);
    // Update the document's color scheme
    document.body.setAttribute('data-theme', this.isDarkTheme() ? 'dark' : 'light');
  }
}
