'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Pencil, Type, Undo2, Check, X, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#ffffff'];

export function PhotoAnnotator({ imageUrl, onSave, onCancel }) {
  const canvasRef = useRef(null);
  const [tool, setTool] = useState('draw');
  const [color, setColor] = useState(COLORS[0]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [textPos, setTextPos] = useState(null);
  const historyRef = useRef([]);
  const imgRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      const rect = canvas.parentElement.getBoundingClientRect();
      const scale = Math.min(rect.width / img.width, rect.height / img.height);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      saveState();
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const saveState = useCallback(() => {
    const canvas = canvasRef.current;
    historyRef.current.push(canvas.toDataURL());
  }, []);

  const undo = useCallback(() => {
    if (historyRef.current.length <= 1) return;
    historyRef.current.pop();
    const prev = historyRef.current[historyRef.current.length - 1];
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = prev;
  }, []);

  const getPos = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0] || e;
    return {
      x: (touch.clientX - rect.left) * (canvas.width / rect.width),
      y: (touch.clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  const startDraw = useCallback((e) => {
    e.preventDefault();
    if (tool === 'text') {
      setTextPos(getPos(e));
      return;
    }
    setIsDrawing(true);
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [tool, color, getPos]);

  const draw = useCallback((e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }, [isDrawing, getPos]);

  const endDraw = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    saveState();
  }, [isDrawing, saveState]);

  const addText = useCallback(() => {
    if (!textInput.trim() || !textPos) return;
    const ctx = canvasRef.current.getContext('2d');
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = color;
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    ctx.strokeText(textInput, textPos.x, textPos.y);
    ctx.fillText(textInput, textPos.x, textPos.y);
    setTextInput('');
    setTextPos(null);
    saveState();
  }, [textInput, textPos, color, saveState]);

  const handleSave = useCallback(() => {
    canvasRef.current.toBlob((blob) => {
      onSave?.(blob);
    }, 'image/jpeg', 0.9);
  }, [onSave]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-black/80">
        <Button variant="ghost" size="sm" onClick={onCancel} className="text-white h-9">
          <X className="h-4 w-4 mr-1" /> Cancel
        </Button>
        <div className="flex gap-1">
          <Button
            variant="ghost" size="sm"
            onClick={() => setTool('draw')}
            className={cn('h-9 text-white', tool === 'draw' && 'bg-white/20')}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" size="sm"
            onClick={() => setTool('text')}
            className={cn('h-9 text-white', tool === 'text' && 'bg-white/20')}
          >
            <Type className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={undo} className="h-9 text-white">
            <Undo2 className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={handleSave} className="text-green-400 h-9">
          <Check className="h-4 w-4 mr-1" /> Save
        </Button>
      </div>

      {/* Color picker */}
      <div className="flex justify-center gap-2 py-2 bg-black/60">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={cn(
              'h-7 w-7 rounded-full border-2 transition-transform',
              color === c ? 'border-white scale-110' : 'border-white/30'
            )}
            style={{ backgroundColor: c }}
            aria-label={`Color ${c}`}
          />
        ))}
      </div>

      {/* Canvas */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full touch-none"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>

      {/* Text input modal */}
      {textPos && (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-black/80">
          <div className="flex gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Enter text..."
              autoFocus
              className="flex-1 h-10 px-3 rounded-lg bg-white/10 text-white text-sm border border-white/20"
              onKeyDown={(e) => e.key === 'Enter' && addText()}
            />
            <Button onClick={addText} size="sm" className="h-10">Add</Button>
            <Button variant="ghost" onClick={() => setTextPos(null)} size="sm" className="h-10 text-white">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
