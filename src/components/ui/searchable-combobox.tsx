import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface SearchableComboboxOption {
  value: string;
  label: string;
  searchText?: string;
}

interface SearchableComboboxProps {
  options: SearchableComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  minCharsToSearch?: number;
}

export function SearchableCombobox({
  options,
  value,
  onChange,
  placeholder = "Digite para buscar...",
  emptyText = "Nenhum resultado encontrado.",
  disabled = false,
  className,
  minCharsToSearch = 2,
}: SearchableComboboxProps) {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [isOpen, setIsOpen] = React.useState(false);
  const [filteredOptions, setFilteredOptions] = React.useState<SearchableComboboxOption[]>([]);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Filter options based on search term
  React.useEffect(() => {
    if (searchTerm.length < minCharsToSearch) {
      setFilteredOptions([]);
      setIsOpen(false);
      return;
    }

    const lowerSearch = searchTerm.toLowerCase();
    const filtered = options
      .filter((opt) => {
        const searchableText = opt.searchText || opt.label;
        return searchableText.toLowerCase().includes(lowerSearch);
      })
      .slice(0, 20); // Limit to 20 results for performance

    setFilteredOptions(filtered);
    setIsOpen(filtered.length > 0);
  }, [searchTerm, options, minCharsToSearch]);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    const selected = options.find((opt) => opt.value === optionValue);
    setSearchTerm(selected?.label || "");
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchTerm(newValue);
    
    // Clear selection if user starts typing
    if (value && newValue !== selectedOption?.label) {
      onChange("");
    }
  };

  const handleInputFocus = () => {
    // Don't auto-open, wait for user to type
    if (selectedOption) {
      setSearchTerm(selectedOption.label);
    }
  };

  const handleInputBlur = () => {
    // Restore selected value label if nothing was selected
    setTimeout(() => {
      if (selectedOption && !isOpen) {
        setSearchTerm(selectedOption.label);
      } else if (!value) {
        setSearchTerm("");
      }
    }, 200);
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Input
        type="text"
        value={searchTerm}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full"
        autoComplete="off"
      />
      
      {isOpen && filteredOptions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          <ScrollArea className="max-h-[300px]">
            <div className="p-1">
              {filteredOptions.map((option) => (
                <div
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                    value === option.value && "bg-accent text-accent-foreground"
                  )}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="flex-1 truncate">{option.label}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
      
      {isOpen && filteredOptions.length === 0 && searchTerm.length >= minCharsToSearch && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-4 shadow-lg">
          <p className="text-sm text-muted-foreground text-center">{emptyText}</p>
        </div>
      )}
    </div>
  );
}
