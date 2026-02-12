import React, { useEffect, useState } from "react";

// Constant
import { TIME_OPTIONS } from "@/lib/constant";

// Services
import { getTimeSpentStats } from "@/services/statics";

// Utils
import { getTranslation } from "@/lib/utils";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

// Shadcn
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from "@/components/shadcn/ui/chart";

import { useSelector } from "react-redux";
import { SelectCourseEditingLanguage } from "@/redux/slices/user";

const chartConfig = {
    averageDuration: {
        label: "Average Duration in Hours: ",
        color: "#BB923D",
    },
};

function formatHours(hours) {
    if (typeof hours !== "number" || hours < 0) {
        throw new Error("Input must be a positive number");
    }

    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

function filterByLanguage(data, language) {
    // Validate language input
    if (language !== "en" && language !== "es") {
        throw new Error("Language must be either 'en' or 'es'");
    }

    return data.map((item) => ({
        period: item.period,
        averageDuration: item.averageDuration[language],
        totalDuration: item.totalDuration[language],
    }));
}

const TimeSpentChart = () => {
    const [data, setData] = useState(null);
    const [totalTime, setTotalTime] = useState(0);
    const [selectedTimeOption, setSelectedTimeOption] = useState(
        TIME_OPTIONS[1].value
    );

    const courseLang = useSelector(SelectCourseEditingLanguage);

    useEffect(() => {
        const fetchData = async () => {
            const query = { filter: selectedTimeOption };

            const data = await getTimeSpentStats(query);
            if (Array.isArray(data?.result)) {
                setData(filterByLanguage(data.result, courseLang));
            }
            if (getTranslation(data?.totalAverageTimeSpent, courseLang)) {
                setTotalTime(getTranslation(data.totalAverageTimeSpent, courseLang));
            }
        };
        fetchData();
    }, [selectedTimeOption, courseLang]);

    return (
        <div className="bg-white p-4 rounded-[10px] shadow-md">
            <h3 className="text-site-primary text-sm">Average Weekly Time Spent</h3>
            <div className="flex items-center justify-between mb-6">
                <p className="font-bold text-lg">{formatHours(totalTime)}</p>
                {/* <OptionSelector
                    options={TIME_OPTIONS}
                    onSelect={(value) => setSelectedTimeOption(value)}
                /> */}
            </div>
            <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
                <LineChart accessibilityLayer data={data}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                        dataKey="period"
                        tickLine={false}
                        tickMargin={10}
                        axisLine={false}
                        interval={"preserveStartEnd"}
                    />
                    <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickMargin={10}
                        minTickGap={5}
                        domain={[0, (dataMax) => Math.max(10, dataMax)]}
                    />
                    <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent indicator="dashed" />}
                    />
                    <Line type="monotone" dataKey="averageDuration" stroke="#BB923D" />
                </LineChart>
            </ChartContainer>
        </div>
    );
};

export default TimeSpentChart;
