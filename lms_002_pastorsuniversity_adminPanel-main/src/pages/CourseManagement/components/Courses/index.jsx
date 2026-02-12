// Components
import CourseGridView from "./CourseGridView";
import CourseListView from "./CourseListView";

export default function Courses({ layout }) {
    return (
        <div>{layout === "grid" ? <CourseGridView /> : <CourseListView />}</div>
    );
}
