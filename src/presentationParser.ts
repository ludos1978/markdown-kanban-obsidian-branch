import { KanbanTask } from './markdownParser';
import { IdGenerator } from './utils/idGenerator';

export interface PresentationSlide {
  title?: string;
  content: string;
  slideNumber: number;
}

export class PresentationParser {
  /**
   * Parse presentation markdown content into individual slides
   * Slides are separated by '---'
   */
  static parsePresentation(content: string): PresentationSlide[] {
    if (!content || !content.trim()) {
      return [];
    }

    // Split by slide separators
    const rawSlides = content.split(/^---\s*$/gm);
    const slides: PresentationSlide[] = [];

    rawSlides.forEach((slideContent, index) => {
      const trimmedContent = slideContent.trim();
      if (!trimmedContent) {
        return; // Skip empty slides
      }

      const lines = trimmedContent.split('\n');
      let title: string | undefined;
      let remainingContent: string;

      // Find title: either a heading (# to ######) or the first non-empty line within first 3 lines
      let titleLineIndex = -1;
      let titleLine: string | undefined;

      for (let i = 0; i < Math.min(3, lines.length); i++) {
        const line = lines[i].trim();
        if (line) {
          // Check if it's a heading (H1-H6 only, not H7)
          if (line.match(/^#{1,6}\s+/)) {
            titleLine = lines[i]; // Keep original line with exact spacing and heading level
            title = titleLine; // Store the full heading with depth (H1-H6)
            titleLineIndex = i;
            break;
          } else if (titleLineIndex === -1) {
            // First non-empty line that's not a heading - use as plain text title
            title = line;
            titleLineIndex = i;
            break;
          }
        }
      }

      if (titleLineIndex >= 0) {
        // Remove the title line from content
        const contentLines = [
          ...lines.slice(0, titleLineIndex),
          ...lines.slice(titleLineIndex + 1)
        ];
        remainingContent = contentLines.join('\n').trim();
      } else {
        remainingContent = trimmedContent;
      }

      slides.push({
        title,
        content: remainingContent,
        slideNumber: index + 1
      });
    });

    return slides;
  }

  /**
   * Convert presentation slides to kanban tasks
   */
  static slidesToTasks(slides: PresentationSlide[]): KanbanTask[] {
    return slides.map(slide => {
      const task: KanbanTask = {
        id: IdGenerator.generateTaskId(),
        title: slide.title || '',
      };

      // Add content as description if it exists
      if (slide.content && slide.content.trim()) {
        task.description = slide.content;
      }

      return task;
    });
  }

  /**
   * Convert kanban tasks back to presentation format
   * This enables bidirectional editing
   */
  static tasksToPresentation(tasks: KanbanTask[]): string {
    if (!tasks || tasks.length === 0) {
      return '';
    }

    const slides = tasks.map(task => {
      let slideContent = '';

      // Add title with preserved heading depth if it exists
      if (task.title && task.title.trim()) {
        // Plain text title: place on first line, followed by empty line
        slideContent += `${task.title}\n\n`;
      }

      // Add description content
      if (task.description && task.description.trim()) {
        slideContent += task.description;
      }

      return slideContent.trim();
    });

    // Join slides with slide separators
    return slides.filter(slide => slide).join('\n\n---\n\n') + '\n';
  }

  /**
   * Parse a markdown file and convert to kanban tasks
   * This is the main entry point for column includes
   */
  static parseMarkdownToTasks(content: string): KanbanTask[] {
    const slides = this.parsePresentation(content);
    return this.slidesToTasks(slides);
  }
}