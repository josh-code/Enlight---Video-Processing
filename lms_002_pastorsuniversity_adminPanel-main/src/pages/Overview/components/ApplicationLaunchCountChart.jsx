import React, { useEffect, useState } from "react";

// Shadcn
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from "@/components/shadcn/ui/chart";

// Recharts
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

// Custom
import OptionSelector from "@/components/misc/OptionSelector";

// Constant
import { TIME_OPTIONS } from "@/lib/constant";

// Services
import { getAppLaunchData } from "@/services/statics";

const chartConfig = {
    averageCount: {
        label: "Average Count",
        color: "#FD934A",
    },
};

const ApplicationLaunchCountChart = ({ selectedCampus }) => {
    const [data, setData] = useState(null);
    const [selectedTimeOption, setSelectedTimeOption] = useState(
        TIME_OPTIONS[1].value
    );

    useEffect(() => {
        const fetchData = async () => {
            const query = { filter: selectedTimeOption };

            if (
                selectedCampus !== "all" &&
                selectedCampus !== null &&
                selectedCampus !== undefined
            ) {
                query.campusId = selectedCampus;
            }

            const data = await getAppLaunchData(query);
            // console.log({ data });
            setData(data);
        };
        fetchData();
    }, [selectedTimeOption, selectedCampus]);

    return (
        <div className="h-full bg-white rounded-[10px] shadow-md p-4 flex flex-col justify-between max-h-[450px] gap-4">
            <h3 className="component_heading mb-6">
                Average Weekly Application Launch Count
            </h3>
            <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
                <BarChart accessibilityLayer data={data}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                        dataKey="period"
                        tickLine={false}
                        tickMargin={10}
                        axisLine={false}
                        interval={"equidistantPreserveStart"}
                    // interval={"preserveStartEnd"}
                    />
                    <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent indicator="dashed" />}
                    />
                    <Bar
                        dataKey="averageCount"
                        fill="var(--color-averageCount)"
                        radius={4}
                    />
                </BarChart>
            </ChartContainer>
        </div>
    );
};

export default ApplicationLaunchCountChart;
