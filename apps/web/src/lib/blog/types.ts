export type BlogPostStatus = "published" | "draft";

export type BlogFaqItem = {
  answer: string;
  question: string;
};

export type BlogFrontmatter = {
  category: string;
  coverImage?: string;
  description: string;
  faq?: BlogFaqItem[];
  featured: boolean;
  mainTag?: string;
  publishedAt: string;
  readingTime: string;
  seoDescription: string;
  seoTitle: string;
  slug: string;
  status: BlogPostStatus;
  tags: string[];
  title: string;
  updatedAt: string;
};

export type BlogPost = BlogFrontmatter & {
  body: string;
  excerpt: string;
  sourcePath: string;
};
