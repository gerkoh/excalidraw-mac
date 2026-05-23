import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents = {
  p: ({ node: _node, ...props }) => (
    <p {...props} style={{ margin: "0.35em 0", lineHeight: 1.55 }} />
  ),
  ul: ({ node: _node, ...props }) => (
    <ul {...props} style={{ margin: "0.35em 0", paddingLeft: "1.25rem", lineHeight: 1.55 }} />
  ),
  ol: ({ node: _node, ...props }) => (
    <ol {...props} style={{ margin: "0.35em 0", paddingLeft: "1.25rem", lineHeight: 1.55 }} />
  ),
  li: ({ node: _node, ...props }) => <li {...props} style={{ margin: "0.2em 0" }} />,
  h1: ({ node: _node, ...props }) => (
    <h1 {...props} style={{ fontSize: "1.15rem", margin: "0.75em 0 0.35em", fontWeight: 700 }} />
  ),
  h2: ({ node: _node, ...props }) => (
    <h2 {...props} style={{ fontSize: "1.08rem", margin: "0.65em 0 0.3em", fontWeight: 700 }} />
  ),
  h3: ({ node: _node, ...props }) => (
    <h3 {...props} style={{ fontSize: "1.02rem", margin: "0.55em 0 0.25em", fontWeight: 700 }} />
  ),
  h4: ({ node: _node, ...props }) => (
    <h4 {...props} style={{ fontSize: "1rem", margin: "0.45em 0 0.2em", fontWeight: 600 }} />
  ),
  blockquote: ({ node: _node, ...props }) => (
    <blockquote
      {...props}
      style={{
        margin: "0.5em 0",
        paddingLeft: "0.75rem",
        borderLeft: "3px solid var(--color-gray-30, #ccc)",
        color: "var(--color-gray-50, #555)",
      }}
    />
  ),
  code: ({ node: _node, className, children, ...props }) => {
    const isBlock = typeof className === "string" && className.includes("language-");
    if (isBlock) {
      return (
        <code
          {...props}
          className={className}
          style={{
            display: "block",
            fontFamily: "ui-monospace, monospace",
            background: "transparent",
          }}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        {...props}
        className={className}
        style={{
          padding: "1px 4px",
          borderRadius: 4,
          backgroundColor: "var(--color-gray-10, #f0f0f0)",
          fontSize: "0.92em",
          fontFamily: "ui-monospace, monospace",
        }}
      >
        {children}
      </code>
    );
  },
  pre: ({ node: _node, ...props }) => (
    <pre
      {...props}
      style={{
        margin: "0.5em 0",
        padding: "0.6rem 0.75rem",
        borderRadius: 6,
        overflowX: "auto",
        backgroundColor: "var(--color-gray-10, #f4f4f4)",
        fontSize: "0.88em",
        lineHeight: 1.45,
      }}
    />
  ),
  a: ({ node: _node, ...props }) => (
    <a
      {...props}
      style={{ color: "var(--link-color, #2563eb)", textUnderlineOffset: "2px" }}
      target="_blank"
      rel="noopener noreferrer"
    />
  ),
  hr: () => <hr style={{ margin: "0.75em 0", border: 0, borderTop: "1px solid var(--color-gray-30, #ddd)" }} />,
  table: ({ node: _node, ...props }) => (
    <div style={{ overflowX: "auto", margin: "0.5em 0" }}>
      <table
        {...props}
        style={{
          borderCollapse: "collapse",
          fontSize: "0.92em",
          width: "100%",
        }}
      />
    </div>
  ),
  th: ({ node: _node, ...props }) => (
    <th
      {...props}
      style={{
        border: "1px solid var(--color-gray-30, #ccc)",
        padding: "0.35em 0.5em",
        textAlign: "left",
        background: "var(--color-gray-10, #f0f0f0)",
      }}
    />
  ),
  td: ({ node: _node, ...props }) => (
    <td {...props} style={{ border: "1px solid var(--color-gray-30, #ddd)", padding: "0.35em 0.5em" }} />
  ),
};

/**
 * Renders assistant/user markdown in the Copilot sidebar.
 */
export function CopilotMarkdown({ text, className }) {
  const body = typeof text === "string" ? text : "";
  if (!body) return null;
  return (
    <div className={className} style={{ lineHeight: 1.55, wordBreak: "break-word" }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
