import { useEffect, useState } from "react";

// Shadcn
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from "@/components/shadcn/ui/chart";
import { toast } from "sonner";

// Rechart
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

// Services
import { getMostEngageUsersData } from "@/services/statics";

const chartConfig = {
    male: {
        label: "Male",
        color: "#1f77b4",
    },
    female: {
        label: "Female",
        color: "#ff69b4",
    },
};

export default function MostEngageUser({ selectedCampus }) {
    const [chartData, setChartData] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const query = {};

                if (
                    selectedCampus !== "all" &&
                    selectedCampus !== null &&
                    selectedCampus !== undefined
                ) {
                    query.campusId = selectedCampus;
                }

                const data = await getMostEngageUsersData(query);

                setChartData(data);
            } catch (err) {
                console.log(err);
                toast.error(err.message,);
            }
        };
        fetchData();
    }, [selectedCampus]);

    return (
        <div className="h-full bg-white rounded-[10px] shadow-md p-4 flex flex-col justify-between max-h-[450px] gap-4">
            <h3 className="component_heading mb-6">Most engaged learners</h3>
            <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
                <BarChart accessibilityLayer data={chartData}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                        dataKey="ageGroup"
                        tickLine={false}
                        tickMargin={10}
                        axisLine={false}
                    // tickFormatter={(value) => value.slice(0, 3)}
                    />
                    <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent indicator="dashed" />}
                    />
                    <Bar dataKey="male" fill="var(--color-male)" radius={4} />
                    <Bar dataKey="female" fill="var(--color-female)" radius={4} />
                </BarChart>
            </ChartContainer>
        </div>
    );
}
