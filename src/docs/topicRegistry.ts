import gettingStarted from './getting-started.md';
import chat from './chat.md';
import skillsManager from './skills-manager.md';
import schedule from './schedule.md';
import settings from './settings.md';
import admin from './admin.md';
import faq from './faq.md';

export interface HelpTopic {
  slug: string;
  title: string;
  section: 'User Guide' | 'Admin' | 'Reference';
  content: string;
}

export const topics: HelpTopic[] = [
  { slug: 'getting-started', title: 'Getting Started', section: 'User Guide', content: gettingStarted },
  { slug: 'chat', title: 'Chat', section: 'User Guide', content: chat },
  { slug: 'skills-manager', title: 'Skills Manager', section: 'User Guide', content: skillsManager },
  { slug: 'schedule', title: 'Schedule', section: 'User Guide', content: schedule },
  { slug: 'settings', title: 'Settings', section: 'User Guide', content: settings },
  { slug: 'admin', title: 'Administration', section: 'Admin', content: admin },
  { slug: 'faq', title: 'FAQ', section: 'Reference', content: faq },
];

export const sections = ['User Guide', 'Admin', 'Reference'] as const;

export function getTopicBySlug(slug: string): HelpTopic | undefined {
  return topics.find((t) => t.slug === slug);
}
