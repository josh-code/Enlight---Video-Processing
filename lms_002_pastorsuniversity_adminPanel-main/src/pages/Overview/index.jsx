// Components
import Header from "./components/Header";
import CurrentlyWatchingChart from "./components/CurrentlyWatchingChart";
import TimeSpentChart from "./components/TimeSpentChart";

export default function Overview() {
    return (
        <section>
            <div className="pt-7 pb-11">
                <Header />
                <div className="grid grid-cols-[1fr_30%] gap-8 mb-16 mt-6">
                    <TimeSpentChart />
                    <CurrentlyWatchingChart />
                </div>
            </div>
        </section>
    );
}
