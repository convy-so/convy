import Link from "next/link";
import { BookOpen, Calendar, ArrowRight, Lightbulb } from "lucide-react";

export function ProTipsSection() {
  return (
    <div className="bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 rounded-2xl p-8 border border-blue-100/50 shadow-sm">
      <div className="flex items-start gap-4 mb-6">
        <div className="p-3 bg-white rounded-xl shadow-sm">
          <span className="text-2xl"><Lightbulb/></span>
        </div>
        <div>
          <h3 className="text-xl font-bold text-[#080808] mb-2">
            Need Help Getting Started?
          </h3>
          <p className="text-[#696969] text-lg leading-relaxed">
            Check out our comprehensive guide on creating effective conversational surveys, 
            or schedule a personalized demo with our team.
          </p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/docs/survey-creation"
          className="flex items-center gap-3 p-4 bg-white/70 backdrop-blur-sm rounded-xl hover:bg-white/90 transition-all duration-200 group border border-white/50"
        >
          <BookOpen className="w-5 h-5 text-blue-600 group-hover:scale-110 transition-transform" />
          <span className="font-semibold text-[#292929] group-hover:text-blue-600 transition-colors">
            View Creation Guide
          </span>
          <ArrowRight className="w-4 h-4 text-[#696969] group-hover:text-blue-600 group-hover:translate-x-1 transition-all ml-auto" />
        </Link>
        
        <Link
          href="/demo"
          className="flex items-center gap-3 p-4 bg-white/70 backdrop-blur-sm rounded-xl hover:bg-white/90 transition-all duration-200 group border border-white/50"
        >
          <Calendar className="w-5 h-5 text-purple-600 group-hover:scale-110 transition-transform" />
          <span className="font-semibold text-[#292929] group-hover:text-purple-600 transition-colors">
            Schedule Demo
          </span>
          <ArrowRight className="w-4 h-4 text-[#696969] group-hover:text-purple-600 group-hover:translate-x-1 transition-all ml-auto" />
        </Link>
      </div>
    </div>
  );
}