import Markdown from 'react-markdown';

interface MarkdownContentProps {
  content: string;
  isError?: boolean;
}

export default function MarkdownContent({ content, isError }: MarkdownContentProps) {
  const color = isError ? 'text-red-600' : 'text-gray-600';
  return (
    <div className={`text-sm ${color}`}>
    <Markdown
      components={{
        p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
        h1: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
        h2: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
        h3: ({ children }) => <p className="mb-1 font-medium">{children}</p>,
        ul: ({ children }) => <ul className="mb-1.5 list-disc pl-4 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-1.5 list-decimal pl-4 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="mb-0.5">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        pre: ({ children }) => (
          <pre className="mb-1.5 overflow-x-auto rounded bg-gray-50 p-2 font-mono text-xs last:mb-0">
            {children}
          </pre>
        ),
        code: ({ children, className }) =>
          className ? (
            <code className={className}>{children}</code>
          ) : (
            <code className="rounded bg-gray-100 px-1 font-mono text-xs">{children}</code>
          ),
      }}
    >
      {content}
    </Markdown>
    </div>
  );
}
