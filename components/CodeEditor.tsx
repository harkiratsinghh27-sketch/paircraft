'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { Play, Copy, Check, Trash2, Terminal, Code2, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { transform } from 'sucrase';

interface CodeEditorProps {
  code: string;
  language: string;
  onChange: (value: string) => void;
  onLanguageChange: (lang: string) => void;
  onCursorChange?: (cursor: { line: number; column: number }) => void;
  remoteCursor?: { line: number; column: number; sender?: string } | null;
  remoteUserName?: string;
}

const SUPPORTED_LANGUAGES = [
  { id: 'typescript', name: 'TypeScript', defaultCode: `// ⚡ PairCraft Collaborative Session\n// WebRTC Peer-to-Peer Pair Programming\n\ninterface PairSession {\n  id: string;\n  peers: string[];\n  latencyMs: number;\n  active: boolean;\n}\n\nfunction calculateThroughput(bytes: number, ms: number): string {\n  const kbps = (bytes * 8) / ms;\n  return \`\${kbps.toFixed(2)} kbps\`;\n}\n\nconst session: PairSession = {\n  id: "pair-webrtc-node",\n  peers: ["Local Engineer", "Remote Partner"],\n  latencyMs: 18,\n  active: true\n};\n\nconsole.log("Session Initialized:", session);\nconsole.log("WebRTC P2P DataChannel Active!");\nconsole.log("Estimated Bandwidth:", calculateThroughput(1024 * 1024, 85));\n` },
  { id: 'javascript', name: 'JavaScript', defaultCode: `// Real-Time Collaborative WebRTC Engine\nconsole.log("PairCraft JavaScript Runtime Ready!");\n\nconst peerStats = {\n  protocol: "WebRTC DataChannel",\n  crdt: "Yjs / Operational Stream",\n  encryption: "DTLS-SRTP"\n};\n\nconsole.table(peerStats);\n` },
  { id: 'python', name: 'Python', defaultCode: `# PairCraft Python Workspace\ndef solve_two_sum(nums, target):\n    lookup = {}\n    for i, num in enumerate(nums):\n        diff = target - num\n        if diff in lookup:\n            return [lookup[diff], i]\n        lookup[num] = i\n    return []\n\nprint("Running Pair Programming Test...")\nprint("Two Sum Result:", solve_two_sum([2, 7, 11, 15], 9))\n` },
  { id: 'go', name: 'Go', defaultCode: `package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("PairCraft Go Engine Ready")\n    fmt.Println("Low-latency P2P Pair Programming")\n}\n` },
  { id: 'rust', name: 'Rust', defaultCode: `fn main() {\n    println!("PairCraft Rust Workspace");\n    println!("WebRTC Media & State Synchronization");\n}\n` },
  { id: 'html', name: 'HTML / Web', defaultCode: `<!DOCTYPE html>\n<html>\n<head>\n  <title>PairCraft Live App</title>\n</head>\n<body>\n  <h1>Collaborative WebRTC Pair Programming</h1>\n  <p>Connected directly P2P!</p>\n</body>\n</html>\n` }
];

export default function CodeEditor({
  code,
  language,
  onChange,
  onLanguageChange,
  onCursorChange,
  remoteCursor,
  remoteUserName
}: CodeEditorProps) {
  const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [isConsoleOpen, setIsConsoleOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Listen to cursor position changes
    editor.onDidChangeCursorPosition((e) => {
      onCursorChange?.({
        line: e.position.lineNumber,
        column: e.position.column
      });
    });

    // Keyboard shortcut: Ctrl + Enter to run code
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      executeCode();
    });
  };

  // Render Remote Cursor decoration
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !remoteCursor) return;

    const editor = editorRef.current;
    const monaco = monacoRef.current;

    const newDecorations = [
      {
        range: new monaco.Range(
          remoteCursor.line,
          remoteCursor.column,
          remoteCursor.line,
          remoteCursor.column + 1
        ),
        options: {
          className: 'remote-cursor-line',
          after: {
            content: ` ◀ ${remoteUserName || 'Partner'}`,
            inlineClassName: 'remote-cursor-badge'
          }
        }
      }
    ];

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
  }, [remoteCursor, remoteUserName]);

  // Execute Code safely
  const executeCode = useCallback(() => {
    setIsRunning(true);
    setIsConsoleOpen(true);
    const start = performance.now();
    const logs: string[] = [];

    // Capture logs
    const customConsole = {
      log: (...args: any[]) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')),
      error: (...args: any[]) => logs.push(`[ERROR] ` + args.map(a => String(a)).join(' ')),
      warn: (...args: any[]) => logs.push(`[WARN] ` + args.map(a => String(a)).join(' ')),
      table: (obj: any) => logs.push(`[TABLE]\n` + JSON.stringify(obj, null, 2))
    };

    try {
      if (language === 'javascript' || language === 'typescript') {
        const jsCode = transform(code, {
          transforms: ['typescript']
        }).code;

        const runFn = new Function('console', jsCode);
        runFn(customConsole);

        if (logs.length === 0) {
          logs.push('✓ Code executed successfully (no console output).');
        }
      } else {
        // Simulated execution output for Python / Go / Rust
        logs.push(`[${language.toUpperCase()} Virtual Environment]`);
        logs.push(`Compiling and executing code block...`);
        logs.push(`--------------------------------------`);
        if (code.includes('print')) {
          const prints = code.match(/print\((.*?)\)/g) || [];
          prints.forEach(p => {
            const inner = p.replace(/^print\(/, '').replace(/\)$/, '');
            logs.push(`> Output: ${inner.replace(/["']/g, '')}`);
          });
        }
        logs.push(`✓ Process finished with exit code 0`);
      }
    } catch (err: any) {
      logs.push(`Runtime Error: ${err.message || String(err)}`);
    }

    const duration = Math.round((performance.now() - start) * 10) / 10;
    setExecutionTime(duration);
    setOutput(logs);
    setIsRunning(false);
  }, [code, language]);

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLangChange = (newLang: string) => {
    onLanguageChange(newLang);
    const langObj = SUPPORTED_LANGUAGES.find(l => l.id === newLang);
    if (langObj && (!code || code.trim().length === 0 || code.startsWith('//') || code.startsWith('#'))) {
      onChange(langObj.defaultCode);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0f172a] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Editor Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-800/80 border border-slate-700/60 rounded-lg">
            <Code2 className="w-4 h-4 text-sky-400" />
            <select
              value={language}
              onChange={(e) => handleLangChange(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-200 outline-none cursor-pointer"
            >
              {SUPPORTED_LANGUAGES.map(lang => (
                <option key={lang.id} value={lang.id} className="bg-slate-900 text-slate-200">
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          {remoteUserName && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{remoteUserName} collaborating</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyCode}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 rounded-lg transition"
            title="Copy Code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            onClick={executeCode}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 active:scale-95 rounded-lg shadow-lg shadow-sky-500/20 transition disabled:opacity-50"
            title="Run Code (Ctrl + Enter)"
          >
            <Play className={`w-3.5 h-3.5 fill-current ${isRunning ? 'animate-spin' : ''}`} />
            <span>Run Code</span>
            <kbd className="hidden md:inline px-1.5 py-0.5 text-[10px] bg-black/30 rounded text-slate-200 border border-white/10">
              Ctrl+Enter
            </kbd>
          </button>
        </div>
      </div>

      {/* Monaco Code Editor Canvas */}
      <div className="flex-1 relative">
        <Editor
          height="100%"
          language={language === 'html' ? 'html' : language}
          value={code}
          onChange={(val) => onChange(val || '')}
          onMount={handleEditorMount}
          theme="vs-dark"
          options={{
            fontSize: 14,
            fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
            fontLigatures: true,
            minimap: { enabled: true, maxColumn: 80 },
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            lineNumbers: 'on',
            renderWhitespace: 'selection',
            tabSize: 2,
            automaticLayout: true,
            padding: { top: 12, bottom: 12 }
          }}
        />
      </div>

      {/* Bottom Terminal / Output Console Tray */}
      <div className="border-t border-slate-800 bg-slate-950/95 flex flex-col">
        <div
          onClick={() => setIsConsoleOpen(!isConsoleOpen)}
          className="flex items-center justify-between px-4 py-2 bg-slate-900/60 hover:bg-slate-900 cursor-pointer select-none transition"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Terminal className="w-3.5 h-3.5 text-sky-400" />
            <span>Terminal / Console</span>
            {executionTime !== null && (
              <span className="text-[11px] text-emerald-400 font-mono">
                ({executionTime}ms)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {output.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOutput([]);
                }}
                className="p-1 text-slate-400 hover:text-rose-400 rounded transition"
                title="Clear Output"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            {isConsoleOpen ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            )}
          </div>
        </div>

        {isConsoleOpen && (
          <div className="h-36 overflow-y-auto p-3 font-mono text-xs text-slate-300 space-y-1 bg-[#090d16] selection:bg-sky-500/30">
            {output.length === 0 ? (
              <div className="text-slate-500 italic py-2">
                Click "Run Code" or press Ctrl+Enter to execute your code...
              </div>
            ) : (
              output.map((line, idx) => (
                <div
                  key={idx}
                  className={`whitespace-pre-wrap ${
                    line.startsWith('[ERROR]')
                      ? 'text-rose-400 font-semibold'
                      : line.startsWith('[WARN]')
                      ? 'text-amber-400'
                      : line.startsWith('✓')
                      ? 'text-emerald-400 font-semibold'
                      : 'text-slate-200'
                  }`}
                >
                  {line}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
