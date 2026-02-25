"use client";

import { useState } from "react";
import { ColorLabel, PRESET_COLORS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Check } from "lucide-react";
import { nanoid } from "nanoid";

interface ColorLabelManagerProps {
  colorLabels: ColorLabel[];
  onChange: (labels: ColorLabel[]) => void;
}

export function ColorLabelManager({ colorLabels, onChange }: ColorLabelManagerProps) {
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    const label: ColorLabel = {
      id: nanoid(6),
      label: newLabel.trim(),
      color: newColor,
    };
    onChange([...colorLabels, label]);
    setNewLabel("");
    setNewColor(PRESET_COLORS[(colorLabels.length + 1) % PRESET_COLORS.length]);
  };

  const handleDelete = (id: string) => {
    onChange(colorLabels.filter((l) => l.id !== id));
  };

  const handleEdit = (id: string, field: "label" | "color", value: string) => {
    onChange(colorLabels.map((l) => l.id === id ? { ...l, [field]: value } : l));
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground">Color Labels</p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Define labels to color-code subnets by purpose
      </p>

      <div className="space-y-1">
        {colorLabels.map((label) => (
          <div
            key={label.id}
            className="flex items-center gap-2 group py-1"
          >
            {/* Color picker */}
            <div className="relative">
              <div
                className="w-5 h-5 rounded-full border-2 border-transparent cursor-pointer shrink-0"
                style={{ backgroundColor: label.color, borderColor: label.color }}
                onClick={() => setEditingId(editingId === label.id ? null : label.id)}
              />
              {editingId === label.id && (
                <div className="absolute left-0 top-7 z-50 bg-card border border-border rounded-lg p-2 shadow-xl">
                  <div className="grid grid-cols-5 gap-1">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        className={cn(
                          "w-5 h-5 rounded-full border-2 transition-transform hover:scale-110",
                          label.color === c ? "border-white scale-110" : "border-transparent",
                        )}
                        style={{ backgroundColor: c }}
                        onClick={() => {
                          handleEdit(label.id, "color", c);
                          setEditingId(null);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Input
              value={label.label}
              onChange={(e) => handleEdit(label.id, "label", e.target.value)}
              className="h-6 text-xs bg-transparent border-transparent hover:border-border focus:border-border px-1 py-0 flex-1"
              style={{ color: label.color }}
            />

            <button
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/20 transition-opacity shrink-0"
              onClick={() => handleDelete(label.id)}
              aria-label={`Delete label ${label.label}`}
            >
              <Trash2 size={11} className="text-muted-foreground hover:text-destructive-foreground" />
            </button>
          </div>
        ))}
      </div>

      {/* Add new */}
      <div className="flex items-center gap-2 pt-1">
        <div className="relative">
          <div
            className="w-5 h-5 rounded-full cursor-pointer shrink-0 border-2 border-transparent"
            style={{ backgroundColor: newColor, borderColor: newColor }}
            onClick={() => setEditingId(editingId === "new" ? null : "new")}
          />
          {editingId === "new" && (
            <div className="absolute left-0 top-7 z-50 bg-card border border-border rounded-lg p-2 shadow-xl">
              <div className="grid grid-cols-5 gap-1">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    className={cn(
                      "w-5 h-5 rounded-full border-2 transition-transform hover:scale-110",
                      newColor === c ? "border-white scale-110" : "border-transparent",
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => {
                      setNewColor(c);
                      setEditingId(null);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="New label name..."
          className="h-6 text-xs bg-input border-border flex-1 px-2 py-0"
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 shrink-0"
          onClick={handleAdd}
          disabled={!newLabel.trim()}
          aria-label="Add color label"
        >
          <Plus size={12} />
        </Button>
      </div>
    </div>
  );
}
