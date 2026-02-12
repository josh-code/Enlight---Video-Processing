import { useEffect, useState } from "react";

// Shadcn
import { ScrollArea } from "@/components/shadcn/ui/scroll-area";
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from "@/components/shadcn/ui/chart";

// Recharts
import { Label, Pie, PieChart } from "recharts";

// Service
import { getCurrentlyWatchingStats } from "@/services/statics";

import { useSelector } from "react-redux";
import { SelectCourseEditingLanguage } from "@/redux/slices/user";

import { getTranslation } from "@/lib/utils";

// Function to lighten a color
const lightenColor = (hex, factor) => {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);

    r = Math.round(r + (255 - r) * factor);
    g = Math.round(g + (255 - g) * factor);
    b = Math.round(b + (255 - b) * factor);

    const toHex = (val) => val.toString(16).padStart(2, "0");

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

// Function to map colors
const mapColors = (array, initialColor) => {
    const totalElements = array.length;
    return array.map((item, index) => {
        const factor = (index / totalElements) * 0.9;
        const color = lightenColor(initialColor, factor);
        return { ...item, fill: color };
    });
};

const CurrentlyWatchingChart = () => {
    const [chartData, setChartData] = useState([]);
    const [totalMembers, setTotalMembers] = useState(0);
    const [chartConfig, setChartConfig] = useState({});

    const courseLang = useSelector(SelectCourseEditingLanguage);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const query = {};

                const response = await getCurrentlyWatchingStats(query);
                const coloredData = mapColors(response.result, "#BB923D");

                // Process the data to include translated course names
                const processedData = coloredData.map((item) => ({
                    ...item,
                    translatedCourseName:
                        typeof item.courseName === "object"
                            ? getTranslation(item.courseName, courseLang)
                            : item.courseName,
                }));

                setChartData(processedData);
                setTotalMembers(response.totalUser);

                // Dynamically generate chartConfig
                const config = {};
                processedData.forEach((item, index) => {
                    const key = `level${index + 1}`;
                    config[key] = {
                        label: item.translatedCourseName,
                        color: item.fill,
                    };
                });
                setChartConfig(config);
            } catch (err) {
                console.log(err);
            }
        };

        fetchData();
    }, [courseLang]);

    return (
        <div className="bg-white px-4 py-7 rounded-[10px] shadow-md flex flex-col items-center">
            <h3 className="component_heading">Currently Watching</h3>

            <ChartContainer
                config={chartConfig}
                className="min-h-[200px] w-full grow"
            >
                <PieChart>
                    <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent hideLabel />}
                    />
                    <Pie
                        data={chartData}
                        dataKey="userCount"
                        nameKey="translatedCourseName"
                        innerRadius={90}
                        strokeWidth={5}
                    >
                        <Label
                            content={({ viewBox }) => {
                                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                                    return (
                                        <text
                                            x={viewBox.cx}
                                            y={viewBox.cy}
                                            textAnchor="middle"
                                            dominantBaseline="middle"
                                        >
                                            <tspan
                                                x={viewBox.cx}
                                                y={viewBox.cy}
                                                className="fill-black text-3xl font-bold"
                                            >
                                                {totalMembers.toLocaleString()}
                                            </tspan>
                                            <tspan
                                                x={viewBox.cx}
                                                y={(viewBox.cy || 0) + 24}
                                                className="fill-muted-foreground"
                                            >
                                                Members
                                            </tspan>
                                        </text>
                                    );
                                }
                            }}
                        />
                    </Pie>
                </PieChart>
            </ChartContainer>

            <ScrollArea className="h-20 w-full">
                <div className="grid grid-cols-2 gap-4 px-6">
                    {chartData?.filter(Boolean).map((d, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <span
                                className="h-5 w-5 rounded flex-shrink-0"
                                style={{ background: d.fill }}
                            ></span>
                            <span className="text-xs">
                                {d.translatedCourseName} <b>({d.userCount})</b>
                            </span>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
};

export default CurrentlyWatchingChart;
