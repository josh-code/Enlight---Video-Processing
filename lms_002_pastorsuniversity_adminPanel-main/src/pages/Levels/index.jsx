import { useState } from "react";
import TitleWithBack from "@/components/misc/TitleWithBack";
import { useSelector } from "react-redux";
import { SelectLevels } from "@/redux/slices/level";
import LevelsList from "./components/LevelsList";
import AddLevel from "@/components/modals/Level";

export default function Level() {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedLevelId, setSelectedLevelId] = useState(null);
    const levels = useSelector(SelectLevels);

    return (
        <section>
            <div className="pt-7 pb-11 space-y-7">
                <TitleWithBack title={"Levels"} />
                <div>
                    <LevelsList setSelectedLevelId={setSelectedLevelId} setIsOpen={setIsOpen} levels={levels} />
                </div>
            </div>
            <AddLevel
                selectedLevelId={selectedLevelId}
                setSelectedLevelId={setSelectedLevelId}
                open={isOpen}
                onChange={setIsOpen}
            />
        </section>
    );
}
