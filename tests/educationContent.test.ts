import { describe, it, expect } from 'vitest';
import { educationContentSchema } from '../src/modules/education/schemas';
import { isLessonVisible, moduleStages, stagesColumn, visibleStages } from '../src/modules/education/stages';

describe('education content schema', () => {
  it('accepts a video without a transcript', () => {
    const result = educationContentSchema.safeParse({
      content_type: 'video',
      title: 'Counting baby kicks',
      stage: 'trimester_3',
      video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      transcript: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transcript).toBeNull();
      expect(result.data.status).toBe('published');
    }
  });

  it('requires a video link for videos', () => {
    const result = educationContentSchema.safeParse({ content_type: 'video', title: 'No link here' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['video_url']);
  });

  it('accepts an article with text and defaults it to General', () => {
    const result = educationContentSchema.safeParse({
      content_type: 'article',
      title: 'Foods that build blood',
      body: 'Ugu, beans and fish are rich in iron.',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.stages).toEqual(['general']);
  });

  it('accepts an article that is only a link', () => {
    const result = educationContentSchema.safeParse({
      content_type: 'article',
      title: 'WHO antenatal guidance',
      article_url: 'https://www.who.int/',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty article and non-http links', () => {
    expect(educationContentSchema.safeParse({ content_type: 'article', title: 'Empty one' }).success).toBe(false);
    expect(
      educationContentSchema.safeParse({ content_type: 'video', title: 'Bad link', video_url: 'javascript:alert(1)' }).success
    ).toBe(false);
  });
});

describe('lessons for more than one group of weeks', () => {
  const video = { content_type: 'video', title: 'Counting baby kicks', video_url: 'https://youtu.be/dQw4w9WgXcQ' };

  it('saves several groups, and still reads a single group from older app versions', () => {
    const many = educationContentSchema.parse({ ...video, stages: ['trimester_3', 'trimester_2', 'trimester_3'] });
    expect(many.stages).toEqual(['trimester_2', 'trimester_3']);
    expect(stagesColumn(many.stages)).toBe('trimester_2,trimester_3');
    expect(educationContentSchema.parse({ ...video, stage: 'postpartum' }).stages).toEqual(['postpartum']);
    // General already covers every week
    expect(educationContentSchema.parse({ ...video, stages: ['general', 'trimester_1'] }).stages).toEqual(['general']);
    expect(educationContentSchema.safeParse({ ...video, stages: [] }).success).toBe(false);
    expect(educationContentSchema.safeParse({ ...video, stages: ['week_99'] }).success).toBe(false);
  });

  it('shows the lesson to a patient in any of its groups', () => {
    const lesson = { stage: 'trimester_2,trimester_3', week_number: null };
    expect(moduleStages(lesson)).toEqual(['trimester_2', 'trimester_3']);
    const week = (egaWeeks: number) => visibleStages({ egaWeeks, postpartum: null, delivered: false });
    expect(isLessonVisible(lesson, week(10))).toBe(false);
    expect(isLessonVisible(lesson, week(20))).toBe(true);
    expect(isLessonVisible(lesson, week(35))).toBe(true);
    // Old rows: one group, or only a week number
    expect(moduleStages({ stage: 'postpartum' })).toEqual(['postpartum']);
    expect(moduleStages({ stage: null, week_number: 30 })).toEqual(['trimester_3']);
    expect(moduleStages({ stage: null, week_number: null })).toEqual(['general']);
  });
});
