import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Handsoff",
  description: "Handsoff application",
};

/**
 * Typography scale (design tokens)
 * ---------------------------------
 * Tokens are exposed as CSS custom properties on :root so every component
 * consumes the same scale instead of arbitrary font-size/weight/line-height
 * values. Body text is 16px minimum and all pairings target WCAG AA contrast
 * when used with the semantic foreground colors.
 *
 * | Token        | Size / Line-height | Weight |
 * | ------------ | ------------------ | ------ |
 * | --text-h1    | 2.5rem / 1.2      | 700    |
 * | --text-h2    | 2rem / 1.25       | 700    |
 * | --text-h3    | 1.75rem / 1.3     | 600    |
 * | --text-h4    | 1.5rem / 1.35     | 600    |
 * | --text-h5    | 1.25rem / 1.4     | 600    |
 * | --text-h6    | 1.125rem / 1.4    | 600    |
 * | --text-body  | 1rem / 1.6        | 400    |
 * | --text-label | 0.875rem / 1.4    | 500    |
 * | --text-caption | 0.75rem / 1.4   | 400    |
 */
const typographyScale = `
  :root {
    --font-sans: ${inter.style.fontFamily};

    --text-h1-size: 2.5rem;
    --text-h1-line-height: 1.2;
    --text-h1-weight: 700;

    --text-h2-size: 2rem;
    --text-h2-line-height: 1.25;
    --text-h2-weight: 700;

    --text-h3-size: 1.75rem;
    --text-h3-line-height: 1.3;
    --text-h3-weight: 600;

    --text-h4-size: 1.5rem;
    --text-h4-line-height: 1.35;
    --text-h4-weight: 600;

    --text-h5-size: 1.25rem;
    --text-h5-line-height: 1.4;
    --text-h5-weight: 600;

    --text-h6-size: 1.125rem;
    --text-h6-line-height: 1.4;
    --text-h6-weight: 600;

    --text-body-size: 1rem;
    --text-body-line-height: 1.6;
    --text-body-weight: 400;

    --text-label-size: 0.875rem;
    --text-label-line-height: 1.4;
    --text-label-weight: 500;

    --text-caption-size: 0.75rem;
    --text-caption-line-height: 1.4;
    --text-caption-weight: 400;
  }

  body {
    font-family: var(--font-sans), system-ui, sans-serif;
    font-size: var(--text-body-size);
    line-height: var(--text-body-line-height);
    font-weight: var(--text-body-weight);
  }

  h1 {
    font-size: var(--text-h1-size);
    line-height: var(--text-h1-line-height);
    font-weight: var(--text-h1-weight);
  }

  h2 {
    font-size: var(--text-h2-size);
    line-height: var(--text-h2-line-height);
    font-weight: var(--text-h2-weight);
  }

  h3 {
    font-size: var(--text-h3-size);
    line-height: var(--text-h3-line-height);
    font-weight: var(--text-h3-weight);
  }

  h4 {
    font-size: var(--text-h4-size);
    line-height: var(--text-h4-line-height);
    font-weight: var(--text-h4-weight);
  }

  h5 {
    font-size: var(--text-h5-size);
    line-height: var(--text-h5-line-height);
    font-weight: var(--text-h5-weight);
  }

  h6 {
    font-size: var(--text-h6-size);
    line-height: var(--text-h6-line-height);
    font-weight: var(--text-h6-weight);
  }

  .text-label {
    font-size: var(--text-label-size);
    line-height: var(--text-label-line-height);
    font-weight: var(--text-label-weight);
  }

  .text-caption {
    font-size: var(--text-caption-size);
    line-height: var(--text-caption-line-height);
    font-weight: var(--text-caption-weight);
  }
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: typographyScale }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
