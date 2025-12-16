"use client"

import { useState } from "react"
import { TrendingUp } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, LabelList, ReferenceLine } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
} from "@/components/ui/chart"

const chartData = [
  { name: "1", value: 30 },
  { name: "2", value: 60 },
  { name: "3", value: 30 },
  { name: "4", value: 0 },
  { name: "5", value: 30 },
  { name: "6", value: 60 },
  { name: "7", value: 30 },
  { name: "8", value: 30 },
  { name: "9", value: 60 },
  { name: "10", value: 30 },
  { name: "11", value: 30 },
  { name: "12", value: 60 },
  { name: "13", value: 30 },
  { name: "14", value: 0 },
  { name: "15", value: 60 },
  { name: "16", value: 30 },
  { name: "17", value: 30 },
  { name: "18", value: 60 },
  { name: "19", value: 30 },
  { name: "20", value: 30 },
  { name: "21", value: 60 },
  { name: "22", value: 30 },
  { name: "23", value: 30 },
  { name: "24", value: 60 },
  { name: "25", value: 30 },
  { name: "26", value: 0 },
  { name: "27", value: 30 },
  { name: "28", value: 60 },
  { name: "29", value: 30 },
  { name: "30", value: 30 },
  { name: "31", value: 60 },
  { name: "32", value: 30 },
  { name: "33", value: 30 },
  { name: "34", value: 60 },
  { name: "35", value: 30 },
  { name: "36", value: 30 },
  { name: "37", value: 0 },
  { name: "38", value: 30 },
  { name: "39", value: 60 },
  { name: "40", value: 30 },
]

const chartConfig = {
  value: {
    label: "Value",
    color: "#2563eb",
  },
} satisfies ChartConfig

// Calculate average
const average = chartData.reduce((sum, item) => sum + item.value, 0) / chartData.length

export default function StatsCard() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  return (
    <Card className="w-[80vw]">
      <CardHeader className="!flex-row items-center justify-between">
        <span className="text-gray-600">Roles</span>
        <CardTitle className="!font-normal">Parking Helms</CardTitle>
        <span className="text-gray-600">1-14 Dec, 25</span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 rounded-xl bg-gray-100 p-4 border border-[#e0e0e0] shadow-sm">
            <p className="font-medium text-gray-900">Card 1</p>
            <p className="text-sm text-gray-600">Content goes here</p>
          </div>
          <div className="flex-1 rounded-xl bg-gray-100 p-4 border border-[#e0e0e0] shadow-sm">
            <p className="font-medium text-gray-900">Card 2</p>
            <p className="text-sm text-gray-600">Content goes here</p>
          </div>
        </div>
        <ChartContainer config={chartConfig} className="h-[120px] w-full !aspect-auto">
          <BarChart
            accessibilityLayer
            data={chartData}
            onMouseMove={(state: any) => {
              if (state?.activeTooltipIndex !== undefined) {
                setActiveIndex(state.activeTooltipIndex)
              }
            }}
            onMouseLeave={() => setActiveIndex(null)}
          >
            <CartesianGrid vertical={false} syncWithTicks />
            <YAxis 
              domain={[0, 60]} 
              tickCount={5}
              axisLine={false}
              tickLine={false}
            />
            <ReferenceLine 
              y={average} 
              stroke="#9ca3af"
              strokeDasharray="4 4" 
              strokeWidth={1}
            />
            <XAxis
              dataKey="name"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              hide
            />
            <Bar dataKey="value" fill="var(--color-value)" radius={4}>
              <LabelList
                dataKey="value"
                position="top"
                content={({ x, y, width, value, index }: any) => {
                  if (activeIndex !== index) return null
                  return (
                    <text
                      x={x + width / 2}
                      y={y - 8}
                      textAnchor="middle"
                      fill="#374151"
                      fontSize={12}
                      fontWeight={500}
                    >
                      {value}
                    </text>
                  )
                }}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
      </CardFooter>
    </Card>
  )
}
