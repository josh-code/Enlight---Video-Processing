import { useState } from "react";

const OptionSelector = ({ options, onSelect }) => {
    const [selected, setSelected] = useState(options[0].value);

    const handleSelect = (value) => {
        setSelected(value);
        onSelect(value);
    };

    return (
        <div className="flex border border-gray-300 rounded-lg overflow-hidden">
            {options.map((option, index) => {
                const isSelected = selected === option.value;
                const isFirst = index === 0;
                const isLast = index === options.length - 1;
                return (
                    <button
                        key={option.value}
                        onClick={() => handleSelect(option.value)}
                        className={`py-1.5 text-xs px-4
                            ${isSelected
                                ? "bg-site-primary/15 text-site-primary"
                                : "bg-white text-gray-600"
                            }
                            ${!isFirst && "border-l"}
                            ${!isLast && "border-r"}
                            flex-1 focus:outline-none transition-colors duration-200 ease-in-out`}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
};

export default OptionSelector;
