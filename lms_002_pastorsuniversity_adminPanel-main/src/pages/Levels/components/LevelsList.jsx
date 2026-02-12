import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/shadcn/ui/table";

// Icon
import { Edit } from "@/assets/icons";
import { Check } from "lucide-react";

const LEVELS_TABLE_HEADER = ["#", "Name", "Certificate", "Manage"];

export default function LevelsList({ levels, setSelectedLevelId, setIsOpen }) {

    const handleEdit = (id) => {
        setSelectedLevelId(id);
        setIsOpen(true);
    };

    return (
        <div className="border-2 border-site-table-border overflow-hidden rounded-[10px]">
            <Table className="min-w-full">
                <TableHeader className="border-b-2 border-site-table-border">
                    <TableRow>
                        {LEVELS_TABLE_HEADER.map((item, index) => (
                            <TableHead
                                className="text-sm font-bold text-text-main text-center"
                                key={index}
                            >
                                {item}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody id="level-list-body">
                    {levels.map((level, index) => (
                        <TableRow
                            className="border-b-2 border-site-table-border"
                            key={level._id}
                        >
                            <TableCell className="text-center text-site-general">
                                {index + 1}
                            </TableCell>
                            <TableCell className="text-center text-site-general">
                                {level.name}
                            </TableCell>
                            <TableCell className="text-center text-site-general">
                                {level.certificate ? (
                                    <div className="border border-site-approve rounded text-site-approve inline-flex justify-center gap-1 items-center px-3 py-1 text-xs">
                                        Added
                                        <Check size={13} />
                                    </div>
                                ) : (
                                    "-"
                                )}
                            </TableCell>

                            <TableCell className="text-center text-site-general flex justify-center">
                                <button onClick={() => handleEdit(level._id)}>
                                    <Edit size={16} className="fill-site-general" />
                                </button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
