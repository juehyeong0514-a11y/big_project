import { useMemo, useState } from "react";
import { Save, Search, Trash2 } from "lucide-react";
import type { AdminOrganizationOption, AuthSession, ManageableAdminRole, UpdateAdminUserInput, User, UserRole } from "@dcvp/shared";

const roleLabels: Record<"ADMIN" | ManageableAdminRole, string> = {
  ADMIN: "운영자",
  ORGANIZATION: "조직 관리자",
  PROCTOR: "감독관"
};

type AccountSortKey = "ORGANIZATION" | "NAME" | "ROLE" | "CREATED_AT";
type AccountRoleFilter = "ALL" | "ADMIN" | "ORGANIZATION" | "PROCTOR";

const sortLabels: Record<AccountSortKey, string> = {
  ORGANIZATION: "조직별",
  NAME: "이름별",
  ROLE: "권한별",
  CREATED_AT: "생성일순"
};

function userEditState(user: User): UpdateAdminUserInput {
  return { name: user.name, email: user.email, role: user.role, organizationId: user.organizationId };
}

export function UsersTable(props: {
  readonly session: AuthSession;
  readonly users: readonly User[];
  readonly organizations: readonly AdminOrganizationOption[];
  readonly organizationNameById: Record<string, string>;
  readonly edits: Record<string, UpdateAdminUserInput>;
  readonly updateEdit: (user: User, patch: Partial<UpdateAdminUserInput>) => void;
  readonly saveUser: (user: User) => void;
  readonly deleteUser: (user: User) => void;
  readonly isSaving: boolean;
  readonly isDeleting: boolean;
  readonly isLoading: boolean;
  readonly error: unknown;
}) {
  const [query, setQuery] = useState("");
  const [organizationFilter, setOrganizationFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState<AccountRoleFilter>("ALL");
  const [sortKey, setSortKey] = useState<AccountSortKey>("ORGANIZATION");
  const operator = props.session.user.role === "ADMIN";
  const filteredUsers = useMemo(
    () => sortUsers(filterUsers(props.users, { query, organizationFilter, roleFilter, organizationNameById: props.organizationNameById }), sortKey, props.organizationNameById),
    [organizationFilter, props.organizationNameById, props.users, query, roleFilter, sortKey]
  );

  return (
    <section className="panel">
      <div className="section-title"><div><h2>등록된 계정</h2><p>{operator ? "운영자는 전체 조직의 계정을 수정할 수 있습니다." : "조직 관리자는 자기 조직의 계정만 수정할 수 있습니다."}</p></div></div>
      <div className="account-list-controls" aria-label="등록된 계정 정렬과 필터">
        <label className="search account-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 또는 이메일 검색" />
        </label>
        {operator ? (
          <label>조직
            <select value={organizationFilter} onChange={(event) => setOrganizationFilter(event.target.value)}>
              <option value="ALL">전체 조직</option>
              {props.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </select>
          </label>
        ) : null}
        <label>권한
          <select value={roleFilter} onChange={(event) => setRoleFilter(parseRoleFilter(event.target.value))}>
            <option value="ALL">전체 권한</option>
            {operator ? <option value="ADMIN">{roleLabels.ADMIN}</option> : null}
            <option value="ORGANIZATION">{roleLabels.ORGANIZATION}</option>
            <option value="PROCTOR">{roleLabels.PROCTOR}</option>
          </select>
        </label>
        <label>정렬
          <select value={sortKey} onChange={(event) => setSortKey(parseSortKey(event.target.value))}>
            <option value="ORGANIZATION">{sortLabels.ORGANIZATION}</option>
            <option value="NAME">{sortLabels.NAME}</option>
            <option value="ROLE">{sortLabels.ROLE}</option>
            <option value="CREATED_AT">{sortLabels.CREATED_AT}</option>
          </select>
        </label>
      </div>
      {props.isLoading ? <div className="ready-banner">계정을 불러오는 중입니다.</div> : null}
      {props.error ? <div className="ready-banner ready-banner-error">{errorMessage(props.error)}</div> : null}
      <div className="table-wrap">
        <table>
          <thead><tr><th>이름</th><th>이메일</th><th>권한</th><th>조직</th><th>생성일</th><th>저장</th></tr></thead>
          <tbody>
            {filteredUsers.map((user) => <UserEditRow key={user.id} user={user} {...props} />)}
            {filteredUsers.length === 0 ? <tr><td colSpan={6}>조건에 맞는 계정이 없습니다.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function RoleSelect({ value, onChange, operator }: { readonly value: UserRole; readonly onChange: (role: UserRole) => void; readonly operator: boolean }) {
  return (
    <label className="inline-field">
      <span className="sr-only">권한</span>
      <select value={value} onChange={(event) => onChange(parseEditableRole(event.target.value, operator))}>
        {operator ? <option value="ADMIN">{roleLabels.ADMIN}</option> : null}
        <option value="ORGANIZATION">{roleLabels.ORGANIZATION}</option>
        <option value="PROCTOR">{roleLabels.PROCTOR}</option>
      </select>
    </label>
  );
}

function UserEditRow(props: {
  readonly user: User;
  readonly session: AuthSession;
  readonly organizations: readonly AdminOrganizationOption[];
  readonly organizationNameById: Record<string, string>;
  readonly edits: Record<string, UpdateAdminUserInput>;
  readonly updateEdit: (user: User, patch: Partial<UpdateAdminUserInput>) => void;
  readonly saveUser: (user: User) => void;
  readonly deleteUser: (user: User) => void;
  readonly isSaving: boolean;
  readonly isDeleting: boolean;
}) {
  const edit = props.edits[props.user.id] ?? userEditState(props.user);
  const operator = props.session.user.role === "ADMIN";
  const organizationId = edit.organizationId ?? props.user.organizationId ?? "";
  return (
    <tr>
      <td><input value={edit.name} onChange={(event) => props.updateEdit(props.user, { name: event.target.value })} /></td>
      <td><input value={edit.email} onChange={(event) => props.updateEdit(props.user, { email: event.target.value })} type="email" /></td>
      <td><RoleSelect value={edit.role} onChange={(role) => props.updateEdit(props.user, { role })} operator={operator} /></td>
      <td>{operator ? <OrganizationSelect value={organizationId} organizations={props.organizations} onChange={(organizationId) => props.updateEdit(props.user, { organizationId })} /> : props.organizationNameById[organizationId] ?? organizationId}</td>
      <td>{new Date(props.user.createdAt).toLocaleString("ko-KR")}</td>
      <td><div className="account-row-actions"><button className="primary-action compact-action" type="button" onClick={() => props.saveUser(props.user)} disabled={props.isSaving || props.isDeleting}><Save size={16} />저장</button>{operator && props.session.user.id !== props.user.id ? <button className="ghost-action compact-action danger-action" type="button" onClick={() => { if (window.confirm(`'${props.user.name}' 계정을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) props.deleteUser(props.user); }} disabled={props.isDeleting || props.isSaving}><Trash2 size={16} />삭제</button> : null}</div></td>
    </tr>
  );
}

function OrganizationSelect({ value, organizations, onChange }: { readonly value: string; readonly organizations: readonly AdminOrganizationOption[]; readonly onChange: (organizationId: string) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
    </select>
  );
}

function filterUsers(users: readonly User[], filters: { readonly query: string; readonly organizationFilter: string; readonly roleFilter: AccountRoleFilter; readonly organizationNameById: Record<string, string> }) {
  const normalizedQuery = filters.query.trim().toLowerCase();
  return users.filter((user) => {
    const organizationId = user.organizationId ?? "";
    const organizationName = filters.organizationNameById[organizationId] ?? organizationId;
    const queryMatched = !normalizedQuery || user.name.toLowerCase().includes(normalizedQuery) || user.email.toLowerCase().includes(normalizedQuery) || organizationName.toLowerCase().includes(normalizedQuery);
    const organizationMatched = filters.organizationFilter === "ALL" || organizationId === filters.organizationFilter;
    const roleMatched = filters.roleFilter === "ALL" || user.role === filters.roleFilter;
    return queryMatched && organizationMatched && roleMatched;
  });
}

function sortUsers(users: readonly User[], sortKey: AccountSortKey, organizationNameById: Record<string, string>) {
  return [...users].sort((left, right) => {
    switch (sortKey) {
      case "ORGANIZATION":
        return compareText(organizationNameById[left.organizationId ?? ""] ?? left.organizationId ?? "", organizationNameById[right.organizationId ?? ""] ?? right.organizationId ?? "") || compareText(left.name, right.name);
      case "NAME":
        return compareText(left.name, right.name);
      case "ROLE":
        return compareText(roleLabel(left.role), roleLabel(right.role)) || compareText(left.name, right.name);
      case "CREATED_AT":
        return right.createdAt.localeCompare(left.createdAt);
      default:
        return assertNeverSort(sortKey);
    }
  });
}

function roleLabel(role: UserRole) {
  if (role === "ADMIN" || role === "ORGANIZATION" || role === "PROCTOR") return roleLabels[role];
  return "응시자";
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, "ko-KR");
}

function parseEditableRole(value: string, operator: boolean): UserRole {
  if (operator && value === "ADMIN") return "ADMIN";
  if (value === "ORGANIZATION" || value === "PROCTOR") return value;
  return "PROCTOR";
}

function parseRoleFilter(value: string): AccountRoleFilter {
  if (value === "ADMIN" || value === "ORGANIZATION" || value === "PROCTOR") return value;
  return "ALL";
}

function parseSortKey(value: string): AccountSortKey {
  if (value === "NAME" || value === "ROLE" || value === "CREATED_AT") return value;
  return "ORGANIZATION";
}

function assertNeverSort(sortKey: never): never {
  throw new Error(`Unhandled account sort key: ${sortKey}`);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}
