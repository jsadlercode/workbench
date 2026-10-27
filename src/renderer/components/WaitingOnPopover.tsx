/**
 * WaitingOnPopover - the task card's "Waiting on…" editor: a small popover next to the card's
 * menu button with one text field for who or what the task waits on. Enter saves, Esc (or a click
 * outside) cancels. Saving empty text stops the task waiting.
 */
import { useEffect, useId, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverAnchor, PopoverContent } from './ui/popover';
import { Input } from './ui/input';
import { Button } from './ui/button';

interface WaitingOnPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the task waits on now (empty when it isn't waiting); the field starts with it */
  value: string;
  /** Called with the trimmed text when it changed */
  onSave: (waitingOn: string) => void;
  /** What the popover opens next to */
  children: ReactNode;
}

// The popover renders in a portal, but React still bubbles its events up to the card: keep its
// clicks from opening the task, and its pointer and key events from starting a drag
const stop = (e: SyntheticEvent) => e.stopPropagation();

export function WaitingOnPopover({ open, onOpenChange, value, onSave, children }: WaitingOnPopoverProps) {
  const { t } = useTranslation('tasks');
  const inputId = useId();
  const [draft, setDraft] = useState(value);
  const anchorRef = useRef<HTMLDivElement>(null);
  // Closed by a click or focus elsewhere: leave the focus there
  const interactedOutsideRef = useRef(false);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const save = () => {
    const next = draft.trim();
    onOpenChange(false);
    if (next !== value.trim()) onSave(next);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor ref={anchorRef} className="flex">{children}</PopoverAnchor>
      <PopoverContent
        align="end"
        className="w-72 p-3"
        onClick={stop}
        onPointerDown={stop}
        onKeyDown={stop}
        onOpenAutoFocus={() => {
          interactedOutsideRef.current = false;
        }}
        onInteractOutside={() => {
          interactedOutsideRef.current = true;
        }}
        onCloseAutoFocus={(e) => {
          // Saved or cancelled with the keyboard: back to the button it opened from
          e.preventDefault();
          if (!interactedOutsideRef.current) anchorRef.current?.querySelector<HTMLElement>('button')?.focus();
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label htmlFor={inputId} className="text-sm font-medium text-foreground">
            {t('waiting.editor.label')}
          </label>
          <Input
            id={inputId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('waiting.editor.placeholder')}
            className="mt-1.5 h-8"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{t('waiting.editor.hint')}</span>
            <Button type="submit" size="sm" className="h-7 px-2.5">
              {t('waiting.editor.save')}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
