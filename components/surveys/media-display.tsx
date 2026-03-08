"use client";

import Image from "next/image";
import { FileAudio } from "lucide-react";

interface MediaProps {
    url: string;
    type: "image" | "video" | "audio";
    description?: string;
    mimeType?: string;
}

export function MediaDisplay({ media }: { media: MediaProps }) {
    if (!media || !media.url) return null;

    if (media.type === "image") {
        return (
            <div className="rounded-xl overflow-hidden my-2 border border-gray-200 w-full max-w-md">
                <div className="relative aspect-video w-full">
                    <Image
                        src={media.url}
                        alt={media.description || "Survey media"}
                        fill
                        className="object-cover"
                    />
                </div>
                {media.description && (
                    <p className="p-2 text-xs text-gray-500 bg-gray-50 border-t border-gray-100">
                        {media.description}
                    </p>
                )}
            </div>
        );
    }

    if (media.type === "video") {
        return (
            <div className="rounded-xl overflow-hidden my-2 border border-gray-200 bg-black w-full max-w-md">
                <video controls className="w-full aspect-video">
                    <source src={media.url} type={media.mimeType || "video/mp4"} />
                    Your browser does not support the video tag.
                </video>
                {media.description && (
                    <p className="p-2 text-xs text-gray-400 bg-gray-900 border-t border-gray-800">
                        {media.description}
                    </p>
                )}
            </div>
        )
    }

    if (media.type === "audio") {
        return (
            <div className="rounded-xl p-3 my-2 border border-gray-200 bg-gray-50 flex flex-col gap-2 w-full max-w-md">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <FileAudio className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{media.description || "Audio Clip"}</p>
                        <p className="text-xs text-gray-500">Listen to this clip</p>
                    </div>
                </div>
                <audio controls className="w-full h-8 mt-1">
                    <source src={media.url} type={media.mimeType || "audio/mpeg"} />
                    Your browser does not support the audio element.
                </audio>
            </div>
        )
    }

    return null;
}
