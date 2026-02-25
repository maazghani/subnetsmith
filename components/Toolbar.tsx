"use client";

import { useState, useRef } from "react";
import { SubnetSmithConfig } from "@/lib/types";
import { encodeConfig, decodeConfig } from "@/lib/subnet";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Download,
  Upload,
  Share2,
  MoreHorizontal,
  Trash2,
  Check,
  Copy,
  Network,
} from "lucide-react";

interface ToolbarProps {
  config: SubnetSmithConfig;
  onNameChange: (name: string) => void;
  onImport: (config: SubnetSmithConfig) => void;
  onClear: () => void;
}

export function Toolbar({ config, onNameChange, onImport, onClear }: ToolbarProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(config.name);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNameBlur = () => {
    setIsEditingName(false);
    if (nameInput.trim()) {
      onNameChange(nameInput.trim());
    } else {
      setNameInput(config.name);
    }
  };

  const handleExportJSON = () => {
    const json = JSON.stringify(config, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.name.replace(/\s+/g, "-").toLowerCase()}-subnetsmith.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as SubnetSmithConfig;
        if (parsed.rootCidr && parsed.subnets) {
          onImport(parsed);
        }
      } catch {
        alert("Invalid JSON file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleShare = () => {
    const encoded = encodeConfig(config);
    const url = `${window.location.origin}${window.location.pathname}?config=${encoded}`;
    setShareUrl(url);
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    });
  };

  return (
    <header className="flex items-center gap-3 px-4 h-12 border-b border-border bg-card/80 backdrop-blur-sm shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-6 h-6 rounded-md bg-primary/20 border border-primary/40 flex items-center justify-center">
          <Network size={13} className="text-primary" />
        </div>
        <span className="text-sm font-bold tracking-tight text-foreground">
          subnet<span className="text-primary">smith</span>
        </span>
      </div>

      <div className="w-px h-4 bg-border shrink-0" />

      {/* Config name */}
      {isEditingName ? (
        <Input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onBlur={handleNameBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleNameBlur();
            if (e.key === "Escape") { setNameInput(config.name); setIsEditingName(false); }
          }}
          className="h-7 w-48 text-sm bg-input border-border text-foreground px-2"
          autoFocus
        />
      ) : (
        <button
          className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate max-w-48"
          onClick={() => { setIsEditingName(true); setNameInput(config.name); }}
          title="Click to rename"
        >
          {config.name}
        </button>
      )}

      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleShare}
        >
          {shareCopied ? (
            <>
              <Check size={12} className="text-primary" />
              <span className="hidden sm:inline">Copied!</span>
            </>
          ) : (
            <>
              <Share2 size={12} />
              <span className="hidden sm:inline">Share</span>
            </>
          )}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleExportJSON}
        >
          <Download size={12} />
          <span className="hidden sm:inline">Export</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleImportClick}
        >
          <Upload size={12} />
          <span className="hidden sm:inline">Import</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
              <MoreHorizontal size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 bg-card border-border text-foreground">
            <DropdownMenuItem
              className="text-xs gap-2 text-muted-foreground focus:text-foreground cursor-pointer"
              onClick={handleShare}
            >
              <Share2 size={12} />
              Copy share link
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-xs gap-2 text-muted-foreground focus:text-foreground cursor-pointer"
              onClick={handleExportJSON}
            >
              <Download size={12} />
              Export as JSON
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-xs gap-2 text-muted-foreground focus:text-foreground cursor-pointer"
              onClick={handleImportClick}
            >
              <Upload size={12} />
              Import from JSON
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              className="text-xs gap-2 text-destructive-foreground focus:text-destructive-foreground cursor-pointer"
              onClick={onClear}
            >
              <Trash2 size={12} />
              Clear all subnets
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />
    </header>
  );
}
