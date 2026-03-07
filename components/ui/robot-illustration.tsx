"use client";

import { motion } from "framer-motion";

export function RobotIllustration() {
    return (
        <div className="relative w-64 h-64 mx-auto">
            {/* Robot Body */}
            <motion.div
                animate={{
                    y: [0, -10, 0],
                }}
                transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
                className="relative z-10"
            >
                {/* Head */}
                <motion.div
                    className="w-24 h-20 bg-gray-900 rounded-2xl mx-auto relative border-4 border-gray-800 shadow-xl"
                    animate={{ rotate: [-1, 1, -1] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                    {/* Eyes */}
                    <div className="flex justify-center gap-4 mt-6">
                        <motion.div
                            className="w-3 h-3 bg-blue-400 rounded-full shadow-[0_0_8px_rgba(96,165,250,0.8)]"
                            animate={{ opacity: [1, 0.4, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                        />
                        <motion.div
                            className="w-3 h-3 bg-blue-400 rounded-full shadow-[0_0_8px_rgba(96,165,250,0.8)]"
                            animate={{ opacity: [1, 0.4, 1] }}
                            transition={{ duration: 2, repeat: Infinity, delay: 0.1 }}
                        />
                    </div>
                    {/* Antenna */}
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-1 h-6 bg-gray-800">
                        <motion.div
                            className="w-3 h-3 bg-red-500 rounded-full -top-2 -left-1 absolute shadow-[0_0_10px_rgba(239,68,68,0.8)]"
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{ duration: 1, repeat: Infinity }}
                        />
                    </div>
                </motion.div>

                {/* Body */}
                <div className="w-32 h-28 bg-gray-800 rounded-3xl mx-auto mt-2 relative border-4 border-gray-700 shadow-2xl overflow-hidden">
                    {/* Chest Light */}
                    <motion.div
                        className="absolute top-4 left-1/2 -translate-x-1/2 w-12 h-2 bg-gray-900 rounded-full overflow-hidden"
                    >
                        <motion.div
                            className="h-full bg-blue-500 w-1/3"
                            animate={{ x: [-20, 60] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                        />
                    </motion.div>

                    {/* Gears / Lines */}
                    <div className="mt-10 px-4 space-y-2">
                        <div className="h-1 bg-gray-700 w-full rounded-full opacity-50" />
                        <div className="h-1 bg-gray-700 w-3/4 rounded-full opacity-50" />
                        <div className="h-1 bg-gray-700 w-1/2 rounded-full opacity-50" />
                    </div>
                </div>

                {/* Arms */}
                <motion.div
                    className="absolute -left-4 top-24 w-6 h-16 bg-gray-700 rounded-full border-2 border-gray-600 origin-top"
                    animate={{ rotate: [10, 20, 10] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                    className="absolute -right-4 top-24 w-6 h-16 bg-gray-700 rounded-full border-2 border-gray-600 origin-top"
                    animate={{ rotate: [-10, -20, -10] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                />
            </motion.div>

            {/* Floating Shadow */}
            <motion.div
                className="w-32 h-4 bg-black/10 rounded-[100%] mx-auto mt-4 blur-sm"
                animate={{
                    scale: [1, 0.8, 1],
                    opacity: [0.2, 0.1, 0.2],
                }}
                transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
            />
        </div>
    );
}
