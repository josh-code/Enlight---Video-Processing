import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcn/ui/table";
import { Badge } from "@/components/shadcn/ui/badge";

// Utils
import { formatCurrency, getTranslation } from "@/lib/utils";

// Redux
import { useSelector } from "react-redux";
import { SelectCourseEditingLanguage } from "@/redux/slices/user";

// Constant
import { TRANSACTION_STATUS } from "@/lib/constant";

function StatusBadge({ status }) {
  const statusColor = {
    [TRANSACTION_STATUS.PENDING]: "bg-yellow-500 hover:bg-yellow-600",
    [TRANSACTION_STATUS.SUCCEEDED]: "bg-green-500 hover:bg-green-600",
    [TRANSACTION_STATUS.FAILED]: "bg-red-500 hover:bg-red-600",
    [TRANSACTION_STATUS.REQUIRES_PAYMENT]: "bg-blue-500 hover:bg-blue-600",
  };

  return (
    <Badge
      className={`text-xs capitalize ${statusColor[status]
        ?.split("_")
        ?.join("-")}`}
    >
      {status}
    </Badge>
  );
}

export default function SoldCoursesTable({ tableHead, tableData }) {
  const courseLang = useSelector(SelectCourseEditingLanguage);
  return (
    <div className="border rounded-md overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {tableHead.map((head, index) => (
              <TableHead key={index}>{head}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tableData.length === 0 ? (
            <TableRow>
              <TableCell colSpan={tableHead.length} className="text-center">
                No data available
              </TableCell>
            </TableRow>
          ) : (
            tableData.map((data, index) => (
              <TableRow key={index}>
                <TableCell>
                  {new Date(data.orderAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {getTranslation(data.courseId?.name, courseLang)}
                </TableCell>
                <TableCell>
                  {data.userId?.firstName + " " + data.userId?.lastName}
                </TableCell>
                <TableCell>
                  {data.userId?.phonePin + " " + data.userId?.phone}
                </TableCell>
                <TableCell>
                  {formatCurrency(data?.amount, data?.currency)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={data.status} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
