// frontend/src/components/world/DayNightSphere.tsx
// Eclipse-style sphere showing day/night cycle progression

import { getTimeOfDayDescription, formatTimeProgress } from '../../utils/timeUtils';
import daynightcycleImg from '../../assets/icons/daynightcycle.png';

interface DayNightSphereProps {
    timeOfDay: number;      // 0.0-1.0 (0=dawn, 0.5=noon, 1.0=midnight)
    currentDay: number;     // Day counter
    messagesInDay: number;  // Progress within day
    messagesPerDay: number; // Total messages per day
}

export function DayNightSphere({
    timeOfDay,
    currentDay,
    messagesInDay,
    messagesPerDay
}: DayNightSphereProps) {
    // Calculate rotation angle (0-180 degrees) with -90° offset
    // This aligns the sun at 12 o'clock (top) when it's noon
    // Dawn (0.0) = -90° (sun at 3 o'clock/east)
    // Noon (0.5) = 0° (sun at 12 o'clock/zenith)
    // Midnight (1.0) = 90° (moon at 12 o'clock/zenith)
    const rotationAngle = (timeOfDay * 180) - 90;

    // Get time description for tooltip
    const timeDescription = getTimeOfDayDescription(timeOfDay);
    const progressText = formatTimeProgress(messagesInDay, messagesPerDay);

    return (
        <div
            className="absolute -top-1 -right-1 z-10 group cursor-help"
            title={`Day ${currentDay} - ${timeDescription}\n${progressText}`}
        >
            {/* Sphere container */}
            <div className="relative" style={{ width: '108px', height: '108px' }}>
                {/* Rotating sphere with custom image */}
                <img
                    src={daynightcycleImg}
                    alt="Day/Night Cycle"
                    className="w-full h-full rounded-full shadow-lg transition-transform duration-1000 ease-in-out"
                    style={{
                        transform: `rotate(${rotationAngle}deg)`,
                    }}
                />

                {/* Tooltip on hover */}
                <div className="absolute top-full right-0 mt-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <div className="bg-black/90 text-white text-xs rounded px-2 py-1 whitespace-nowrap border border-gray-700">
                        <div className="font-semibold">Day {currentDay}</div>
                        <div className="text-gray-400">{timeDescription}</div>
                        <div className="text-gray-500 text-[10px] mt-1">{progressText}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
