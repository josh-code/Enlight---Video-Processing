export default function RoleGate({ allowedRoles, user, children }) {
    // Check if the user has at least one of the allowed roles
    const hasRole = allowedRoles.some((role) => user[role] === true);

    return <>{hasRole ? children : null}</>;
}
